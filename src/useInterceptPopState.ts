import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { useContext } from "react";
import { HandlerDef } from "./@shared/types";
import { DEBUG } from "./@shared/debug";
import { sortHandlersByPriority } from "./useInterceptPopState.helper/sort-handlers";
import {
  newToken,
  setupHistoryAugmentationOnce,
} from "./useInterceptPopState.helper/history-augmentation";
import type { RenderedState } from "./useInterceptPopState.helper/types";
import { useIsomorphicLayoutEffect } from "./@shared/useIsomorphicLayoutEffect";

/**
 * Popstate Interception Hook
 *
 * Handles back navigation interception for Next.js Pages Router.
 * Based on https://github.com/vercel/next.js/discussions/47020#discussioncomment-7826121
 * See docs/HISTORY_API_HACKS.md for detailed explanation.
 *
 * Key concepts:
 * - Token mismatch: Refresh or external domain entry (token missing or different)
 *   → Restore URL with history.go(1), allow with history.back()
 * - Internal navigation: Normal back navigation within app
 *   → Restore URL with history.go(-delta), allow with popstate dispatch
 *
 * @module useInterceptPopState
 */

const renderedStateRef: { current: RenderedState } = {
  current: { index: -1, token: "" },
};

/**
 * Hook that intercepts popstate events and runs registered handlers before navigation.
 *
 * @param params.handlerMap - Map of registered navigation handlers
 * @param params.preRegisteredHandler - Optional handler that runs before all others
 */
export function useInterceptPopState({
  handlerMap,
  preRegisteredHandler,
}: {
  handlerMap: Map<string, HandlerDef>;
  preRegisteredHandler?: () => boolean;
}) {
  const pagesRouter = useContext(RouterContext);

  useIsomorphicLayoutEffect(() => {
    const { writeState } = setupHistoryAugmentationOnce({ renderedStateRef });

    const handlePopState = createHandlePopState(
      handlerMap,
      writeState,
      preRegisteredHandler
    );

    if (pagesRouter) {
      pagesRouter.beforePopState(() => handlePopState(history.state));

      return () => {
        pagesRouter.beforePopState(() => true);
      };
    }
  }, [pagesRouter, preRegisteredHandler]);
}

// ============================================================================
// Navigation State Parsing
// ============================================================================

interface ParsedNavigationState {
  token: string | undefined;
  nextIndex: number;
}

function parseNavigationState(nextState: any = {}): ParsedNavigationState {
  return {
    token: nextState.__next_session_token,
    nextIndex: Number(nextState.__next_navigation_stack_index) || 0,
  };
}

function hasTokenMismatch(token: string | undefined, currentToken: string): boolean {
  return !token || token !== currentToken;
}

// ============================================================================
// Navigation Flags (Immutable State Management)
// ============================================================================

interface NavigationFlagsState {
  dispatchedState: unknown;
  isRestoringFromTokenMismatch: boolean;
  isAllowingNavigation: boolean;
}

function createNavigationFlags() {
  let state: NavigationFlagsState = {
    dispatchedState: null,
    isRestoringFromTokenMismatch: false,
    isAllowingNavigation: false,
  };

  const setState = (updates: Partial<NavigationFlagsState>) => {
    state = { ...state, ...updates };
  };

  return {
    isRestoringFromMismatch: () => state.isRestoringFromTokenMismatch,
    startMismatchRestoration: () => setState({ isRestoringFromTokenMismatch: true }),
    clearMismatchRestoration: () => setState({ isRestoringFromTokenMismatch: false }),

    isNavigationAllowed: () => state.isAllowingNavigation,
    allowNextNavigation: () => setState({ isAllowingNavigation: true }),
    consumeNavigationAllowed: () => {
      const wasAllowed = state.isAllowingNavigation;
      setState({ isAllowingNavigation: false });
      return wasAllowed;
    },

    isDispatched: (target: unknown) => target === state.dispatchedState,
    markDispatched: (target: unknown) => setState({ dispatchedState: target }),
    clearDispatched: () => setState({ dispatchedState: null }),
  };
}

// ============================================================================
// Handler Execution
// ============================================================================

interface HandlerContext {
  handlerMap: Map<string, HandlerDef>;
  preRegisteredHandler?: () => boolean;
}

async function runHandlerChain(
  context: HandlerContext,
  to: string
): Promise<boolean> {
  const { handlerMap, preRegisteredHandler } = context;

  // 1. Run preRegisteredHandler first (highest priority)
  if (preRegisteredHandler) {
    const shouldContinue = preRegisteredHandler();
    if (!shouldContinue) {
      if (DEBUG) console.log(`[Handler] Cancelled by preRegisteredHandler`);
      return false;
    }
  }

  // 2. Run the first handler by priority
  const sortedHandlers = sortHandlersByPriority([...handlerMap.values()]);
  const firstHandler = sortedHandlers[0];

  if (firstHandler) {
    const shouldContinue = await firstHandler.callback({ to });

    // Handle once option - delete after execution
    if (firstHandler.once) {
      handlerMap.delete(firstHandler.id);
    }

    if (!shouldContinue) {
      if (DEBUG) console.log(`[Handler] Cancelled by handler`);
      return false;
    }
  }

  return true;
}

function hasRegisteredHandlers(handlerMap: Map<string, HandlerDef>): boolean {
  return handlerMap.size > 0;
}

// ============================================================================
// Rendered State Computation (Pure Functions)
// ============================================================================

function computeRenderedState(token: string | undefined, nextIndex: number): RenderedState {
  return {
    token: token || newToken(),
    index: token ? nextIndex : 0,
  };
}

function computeRenderedStateWithIndex(current: RenderedState, nextIndex: number): RenderedState {
  return { ...current, index: nextIndex };
}

// ============================================================================
// Popstate Handler Factory
// ============================================================================

/**
 * Creates a popstate handler function that manages navigation blocking.
 *
 * @param handlerMap - Map of registered navigation handlers
 * @param writeState - Function to persist current state to history
 * @param preRegisteredHandler - Optional handler that runs before all others
 * @returns Handler function that returns true to allow navigation, false to block
 */
function createHandlePopState(
  handlerMap: Map<string, HandlerDef>,
  writeState: () => void,
  preRegisteredHandler?: () => boolean
) {
  const flags = createNavigationFlags();
  const handlerContext: HandlerContext = { handlerMap, preRegisteredHandler };

  return (nextState: any = {}): boolean => {
    const { token, nextIndex } = parseNavigationState(nextState);
    const isTokenMismatch = hasTokenMismatch(token, renderedStateRef.current.token!);

    // [Allowing Navigation] Handler already confirmed, let it through
    if (flags.isNavigationAllowed()) {
      if (DEBUG) console.log(`[AllowingNavigation] Allowing navigation (handler confirmed)`);
      flags.consumeNavigationAllowed();
      renderedStateRef.current = computeRenderedState(token, nextIndex);
      writeState();
      return true;
    }

    // ========================================
    // [Token Mismatch Path]
    // Covers: page refresh, external domain entry, direct URL entry
    // ========================================
    if (isTokenMismatch) {
      return handleTokenMismatch({
        flags,
        handlerContext,
        token,
        nextIndex,
        writeState,
      });
    }

    // ========================================
    // [Internal Navigation Path]
    // Normal back/forward navigation within app
    // ========================================
    return handleInternalNavigation({
      flags,
      handlerContext,
      nextState,
      nextIndex,
    });
  };
}

// ============================================================================
// Token Mismatch Handling
// ============================================================================

interface TokenMismatchParams {
  flags: ReturnType<typeof createNavigationFlags>;
  handlerContext: HandlerContext;
  token: string | undefined;
  nextIndex: number;
  writeState: () => void;
}

function handleTokenMismatch({
  flags,
  handlerContext,
  token,
  nextIndex,
  writeState,
}: TokenMismatchParams): boolean {
  // Ignore popstate triggered by our URL restoration (history.go(1))
  if (flags.isRestoringFromMismatch()) {
    flags.clearMismatchRestoration();
    if (DEBUG) console.log(`[TokenMismatch] Ignoring restoration popstate`);
    return false;
  }

  if (DEBUG) {
    console.log(
      `[TokenMismatch] Token mismatch detected (current: ${renderedStateRef.current.token}, next: ${token})`
    );
  }

  // No handlers registered, allow navigation immediately
  if (!hasRegisteredHandlers(handlerContext.handlerMap)) {
    renderedStateRef.current = computeRenderedState(token, nextIndex);
    writeState();
    return true;
  }

  if (DEBUG) console.log(`[TokenMismatch] Blocking and restoring URL with history.go(1)`);

  // Mark restoration in progress and restore URL
  flags.startMismatchRestoration();
  window.history.go(1);

  // Run handlers asynchronously after URL is restored
  setTimeout(async () => {
    // Reset flag - history.go(1) popstate doesn't always trigger beforePopState
    flags.clearMismatchRestoration();

    const shouldNavigate = await runHandlerChain(handlerContext, "");

    if (shouldNavigate) {
      if (DEBUG) console.log(`[TokenMismatch] Allowing navigation with history.back()`);
      renderedStateRef.current = computeRenderedState(token, nextIndex);
      writeState();
      flags.allowNextNavigation();
      window.history.back();
    } else {
      if (DEBUG) console.log(`[TokenMismatch] Navigation blocked by handler`);
    }
  }, 0);

  return false;
}

// ============================================================================
// Internal Navigation Handling
// ============================================================================

interface InternalNavigationParams {
  flags: ReturnType<typeof createNavigationFlags>;
  handlerContext: HandlerContext;
  nextState: any;
  nextIndex: number;
}

function handleInternalNavigation({
  flags,
  handlerContext,
  nextState,
  nextIndex,
}: InternalNavigationParams): boolean {
  const delta = nextIndex - renderedStateRef.current.index;

  // Ignore duplicate popstate (triggered by our history.go(-delta) restoration)
  if (delta === 0) {
    if (DEBUG) console.log(`[Internal] Ignoring restoration popstate (delta is 0)`);
    flags.clearMismatchRestoration(); // Defensive reset
    return false;
  }

  // Forward navigation - always allowed
  const isBackNavigation = delta < 0;
  if (!isBackNavigation) {
    if (DEBUG) console.log(`[Internal] Allowing forward navigation (delta: ${delta})`);
    renderedStateRef.current = computeRenderedStateWithIndex(renderedStateRef.current, nextIndex);
    return true;
  }

  if (DEBUG) console.log(`[Internal] Back navigation detected (delta: ${delta})`);

  // Check if handler already confirmed navigation
  if (flags.consumeNavigationAllowed()) {
    if (DEBUG) console.log(`[Internal] Allowing navigation (async handler confirmed)`);
    renderedStateRef.current = computeRenderedStateWithIndex(renderedStateRef.current, nextIndex);
    return true;
  }

  // Check if this is a re-dispatched popstate or no guards registered
  if (flags.isDispatched(nextState) || !hasRegisteredHandlers(handlerContext.handlerMap)) {
    if (DEBUG) console.log(`[Internal] Allowing navigation (re-dispatched or no guards)`);
    flags.clearDispatched();
    renderedStateRef.current = computeRenderedStateWithIndex(renderedStateRef.current, nextIndex);
    return true;
  }

  if (DEBUG) console.log(`[Internal] Blocking and restoring URL with history.go(${-delta})`);

  // Restore URL
  window.history.go(-delta);

  // Run handlers asynchronously
  (async () => {
    const to = location.pathname + location.search;
    const shouldNavigate = await runHandlerChain(handlerContext, to);

    if (shouldNavigate) {
      if (DEBUG) console.log(`[Internal] Allowing navigation with history.go(${delta})`);
      flags.allowNextNavigation();
      window.history.go(delta);
    } else {
      if (DEBUG) console.log(`[Internal] Navigation blocked by handler`);
    }
  })();

  // Return false to block Next.js state update
  return false;
}
