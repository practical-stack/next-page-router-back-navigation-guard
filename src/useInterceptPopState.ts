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
  let dispatchedState: unknown;

  /**
   * [Token Mismatch] Flag to ignore the popstate triggered by URL restoration.
   * When we call history.go(1) to restore URL, it triggers another popstate that should be ignored.
   */
  let isRestoringFromTokenMismatch = false;

  /**
   * [Internal Navigation] Flag to allow the next popstate after handler confirms navigation.
   * When async handler returns true and we call history.go(delta), the resulting popstate should be allowed.
   */
  let isAllowingNavigation = false;

  return (nextState: any = {}): boolean => {
    const token: string | undefined = nextState.__next_session_token;
    const nextIndex: number =
      Number(nextState.__next_navigation_stack_index) || 0;

    // [FIX: Token Mismatch Navigation]
    // After handler confirms navigation in token mismatch path (e.g., after page refresh),
    // the subsequent history.back() triggers another popstate with token mismatch.
    // This flag ensures that popstate is allowed through without re-triggering handlers.
    // Without this check, clicking "leave" after refresh would restore URL but not navigate.
    if (isAllowingNavigation) {
      if (DEBUG)
        console.log(`[AllowingNavigation] Allowing navigation (handler confirmed)`);
      isAllowingNavigation = false;
      renderedStateRef.current.token = token || newToken();
      renderedStateRef.current.index = token ? nextIndex : 0;
      writeState();
      return true;
    }

    // [Token-based Session Identification]
    // Token mismatch occurs when:
    // 1. Token is missing → entry from external domain
    // 2. Token differs → page refresh (new token generated, history has old token)
    const isTokenMismatch = !token || token !== renderedStateRef.current.token;

    // ========================================
    // [Token Mismatch Handling]
    // Covers: page refresh, external domain entry, direct URL entry
    // ========================================
    if (isTokenMismatch) {
      // Ignore the popstate triggered by our URL restoration (history.go(1))
      if (isRestoringFromTokenMismatch) {
        isRestoringFromTokenMismatch = false;
        if (DEBUG)
          console.log(`[TokenMismatch] Ignoring restoration popstate`);
        return false;
      }

      if (DEBUG)
        console.log(
          `[TokenMismatch] Token mismatch detected (current: ${renderedStateRef.current.token}, next: ${token})`
        );

      const defs = sortHandlersByPriority([...handlerMap.values()]);

      if (defs.length > 0) {
        if (DEBUG)
          console.log(`[TokenMismatch] Blocking and restoring URL with history.go(1)`);

        isRestoringFromTokenMismatch = true;

        // [URL Restoration - External]
        // Browser already changed URL before popstate fires.
        // Use history.go(1) to restore (always 1 step forward since external entry is always 1 back)
        window.history.go(1);

        // Run handler callbacks asynchronously after URL is restored
        setTimeout(async () => {
          // [FIX] Reset here because history.go(1) popstate doesn't trigger beforePopState
          // when navigating to the same URL (Next.js optimization).
          isRestoringFromTokenMismatch = false;
          
          // 1. Run preRegisteredHandler first (highest priority)
          if (preRegisteredHandler) {
            const shouldContinue = preRegisteredHandler();
            if (!shouldContinue) {
              if (DEBUG)
                console.log(`[TokenMismatch] Cancelled by preRegisteredHandler`);
              return;
            }
          }

          // 2. Run the first handler
          const firstDef = defs[0];

          if (firstDef) {
            const shouldContinue = await firstDef.callback({ to: "" });

            // Handle once option - delete after execution
            if (firstDef.once) {
              handlerMap.delete(firstDef.id);
            }

            if (!shouldContinue) {
              if (DEBUG)
                console.log(`[TokenMismatch] Cancelled by handler`);
              return;
            }
          }

          // 3. All passed → allow navigation with history.back()
          if (DEBUG)
            console.log(`[TokenMismatch] Allowing navigation with history.back()`);
          renderedStateRef.current.token = token || newToken();
          renderedStateRef.current.index = token ? nextIndex : 0;
          writeState();
          // Set flag BEFORE history.back() - the resulting popstate needs this flag
          // to bypass token mismatch check and allow navigation through.
          isAllowingNavigation = true;
          window.history.back();
        }, 0);

        return false;
      }

      // No handlers registered, allow navigation
      renderedStateRef.current.token = token || newToken();
      renderedStateRef.current.index = token ? nextIndex : 0;
      writeState();
      return true;
    }

    // ========================================
    // [Internal Navigation Handling]
    // ========================================

    // [Index Tracking] Calculate delta to determine navigation direction
    const delta = nextIndex - renderedStateRef.current.index;

    // Ignore duplicate popstate (triggered by our history.go(-delta) restoration)
    if (delta === 0) {
      if (DEBUG)
        console.log(`[Internal] Ignoring restoration popstate (delta is 0)`);
      // Defensive reset: clear token mismatch flag on any delta===0 popstate
      isRestoringFromTokenMismatch = false;
      return false;
    }

    // [Direction Detection] delta < 0 means back, delta > 0 means forward
    const isBackNavigation = delta < 0;
    if (!isBackNavigation) {
      if (DEBUG)
        console.log(`[Internal] Allowing forward navigation (delta: ${delta})`);
      renderedStateRef.current.index = nextIndex;
      return true;
    }

    if (DEBUG)
      console.log(`[Internal] Back navigation detected (delta: ${delta})`);

    // Allow if this popstate was triggered by our history.go(delta) after async handler confirmed
    if (isAllowingNavigation) {
      if (DEBUG)
        console.log(`[Internal] Allowing navigation (async handler confirmed)`);
      isAllowingNavigation = false;
      renderedStateRef.current.index = nextIndex;
      return true;
    }

    const defs = sortHandlersByPriority([...handlerMap.values()]);

    // Allow if this is a re-dispatched popstate or no guards registered
    if (nextState === dispatchedState || defs.length === 0) {
      if (DEBUG)
        console.log(`[Internal] Allowing navigation (re-dispatched or no guards)`);
      dispatchedState = null;
      renderedStateRef.current.index = nextIndex;
      return true;
    }

    if (DEBUG)
      console.log(`[Internal] Blocking and restoring URL with history.go(${-delta})`);

    // [URL Restoration - Internal]
    // Use history.go(-delta) to restore URL.
    // delta can be > 1 when user selects from browser history dropdown.
    window.history.go(-delta);

    // Run guard callbacks asynchronously after URL is restored
    (async () => {
      // 1. Run preRegisteredHandler first (highest priority)
      if (preRegisteredHandler) {
        const shouldContinue = preRegisteredHandler();
        if (!shouldContinue) {
          if (DEBUG)
            console.log(`[Internal] Cancelled by preRegisteredHandler`);
          return;
        }
      }

      // 2. Run the first handler
      const firstDef = defs[0];

      if (firstDef) {
        const to = location.pathname + location.search;
        const shouldContinue = await firstDef.callback({ to });

        // Handle once option - delete after execution
        if (firstDef.once) {
          handlerMap.delete(firstDef.id);
        }

        if (!shouldContinue) {
          if (DEBUG)
            console.log(`[Internal] Cancelled by guard`);
          return;
        }
      }

      // 3. All passed → navigate using history.go to complete navigation
      if (DEBUG)
        console.log(`[Internal] Allowing navigation with history.go(${delta})`);
      isAllowingNavigation = true;
      window.history.go(delta);
    })();

    // Return false to block Next.js state update
    return false;
  };
}
