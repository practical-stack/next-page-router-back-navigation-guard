/**
 * Popstate Interception Hook
 *
 * Intercepts browser back/forward navigation in Next.js Pages Router.
 * This module handles the core popstate event interception logic.
 *
 * Key Concepts:
 * - Session Token: A unique identifier for the current browser session.
 *   Used to detect page refresh or external domain entry (token mismatch).
 * - History Index: Tracks position in the history stack to calculate navigation delta.
 * - Interception Flow: Restore URL first, run handlers, then allow/block navigation.
 *
 * @see https://github.com/vercel/next.js/discussions/47020#discussioncomment-7826121
 */

import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { useContext } from "react";
import { HandlerDef } from "./@shared/types";
import { DEBUG } from "./@shared/debug";
import { useIsomorphicLayoutEffect } from "./@shared/useIsomorphicLayoutEffect";

import type { NextHistoryState } from "./useInterceptPopState.helper/types";
import { createInterceptionStateContext } from "./useInterceptPopState.helper/interception-state";
import {
  createRenderedStateContext,
  computeNextRenderedState,
  computeRenderedStateWithNextHistoryIndex,
} from "./useInterceptPopState.helper/rendered-state-context";
import {
  parseHistoryState,
  hasSessionTokenMismatch,
} from "./useInterceptPopState.helper/parse-history-state";
import {
  HandlerContext,
  runHandlerChainAndGetShouldAllowNavigation,
  hasRegisteredHandlers,
} from "./useInterceptPopState.helper/handler-execution";

type PopstateHandler = (historyState: NextHistoryState) => boolean;

/**
 * Hook that intercepts popstate events and runs registered handlers before navigation.
 *
 * Uses Next.js Pages Router's `beforePopState` API to intercept navigation.
 * Returns false from beforePopState to prevent Next.js from handling the navigation,
 * then manually controls whether to allow or block based on handler results.
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
    const popstateHandler = createPopstateHandler(
      handlerMap,
      preRegisteredHandler
    );

    if (pagesRouter) {
      pagesRouter.beforePopState(() => popstateHandler(history.state));

      return () => {
        pagesRouter.beforePopState(() => true);
      };
    }
  }, [pagesRouter, preRegisteredHandler]);
}

/**
 * Creates the popstate handler that processes all navigation interception logic.
 *
 * The handler distinguishes between three scenarios:
 * 1. Already confirmed navigation - Allow immediately (handler already approved)
 * 2. Session token mismatch - Page was refreshed or entered from external domain
 * 3. Internal navigation - Normal back/forward within the app
 */
function createPopstateHandler(
  handlerMap: Map<string, HandlerDef>,
  preRegisteredHandler?: () => boolean
): PopstateHandler {
  const renderedStateContext = createRenderedStateContext();
  const interceptionStateContext = createInterceptionStateContext();
  const handlerContext: HandlerContext = { handlerMap, preRegisteredHandler };

  return (historyState: NextHistoryState = {}): boolean => {
    const { nextSessionToken, nextHistoryIndex } = parseHistoryState(historyState);
    const currentRenderedState = renderedStateContext.getState();
    const isSessionTokenMismatch = hasSessionTokenMismatch(
      nextSessionToken,
      currentRenderedState.sessionToken
    );
    const historyIndexDelta = nextHistoryIndex - currentRenderedState.historyIndex;

    // ========================================
    // Already Confirmed Navigation
    // ========================================
    // When handler approves navigation, it sets isNavigationConfirmed=true and triggers
    // history.back() or history.go(). This causes another popstate event, which we
    // detect here and allow through without re-running handlers.
    if (interceptionStateContext.getState().isNavigationConfirmed) {
      if (DEBUG) console.log(`[Confirmed] Navigation confirmed by handler`);
      interceptionStateContext.setState({ isNavigationConfirmed: false });
      renderedStateContext.setStateAndSyncToHistory(
        computeNextRenderedState(nextSessionToken, nextHistoryIndex)
      );
      return true;
    }

    // ========================================
    // Session Token Mismatch (Refresh or External Entry)
    // ========================================
    // Occurs when:
    // - User refreshes the page (new session, no token in history.state)
    // - User enters from external domain or direct URL
    // - Token in history.state doesn't match current session token
    //
    // Strategy: Use history.go(1) to restore URL, then run handlers.
    // If approved, set isNavigationConfirmed and call history.back().
    if (isSessionTokenMismatch) {
      // Ignore popstate triggered by our own history.go(1) restoration
      if (interceptionStateContext.getState().isRestoringUrl) {
        if (DEBUG) console.log(`[SessionTokenMismatch] Ignoring (restoring URL)`);
        interceptionStateContext.setState({ isRestoringUrl: false });
        return false;
      }

      if (DEBUG) {
        console.log(
          `[SessionTokenMismatch] Detected (current: ${currentRenderedState.sessionToken}, next: ${nextSessionToken})`
        );
      }

      // When handlerMap is empty (e.g., after once handler was deleted),
      // we still need to run preRegisteredHandler to handle overlay closures.
      // This is a synchronous fast-path that avoids the async handler chain.
      if (!hasRegisteredHandlers(handlerMap)) {
        if (preRegisteredHandler && !preRegisteredHandler()) {
          return false;
        }
        renderedStateContext.setStateAndSyncToHistory(
          computeNextRenderedState(nextSessionToken, nextHistoryIndex)
        );
        return true;
      }

      if (DEBUG) console.log(`[SessionTokenMismatch] Restoring URL with history.go(1)`);
      interceptionStateContext.setState({ isRestoringUrl: true });
      window.history.go(1);

      // Use setTimeout to ensure URL restoration completes before running handlers
      setTimeout(async () => {
        interceptionStateContext.setState({ isRestoringUrl: false });
        const shouldAllowNavigation = await runHandlerChainAndGetShouldAllowNavigation(handlerContext, "");
        if (shouldAllowNavigation) {
          if (DEBUG) console.log(`[SessionTokenMismatch] Handler confirmed`);
          renderedStateContext.setStateAndSyncToHistory(
            computeNextRenderedState(nextSessionToken, nextHistoryIndex)
          );
          interceptionStateContext.setState({ isNavigationConfirmed: true });
          window.history.back();
        } else {
          if (DEBUG) console.log(`[SessionTokenMismatch] Handler blocked`);
        }
      }, 0);
      return false;
    }

    // ========================================
    // Internal Navigation (Normal Back/Forward)
    // ========================================
    // Normal navigation within the app where session token matches.
    // Delta calculation: positive = forward, negative = back, zero = no-op

    // Delta is 0 when URL was restored by history.go(-delta) - ignore this event
    if (historyIndexDelta === 0) {
      if (DEBUG) console.log(`[Internal] Ignoring (historyIndexDelta is 0)`);
      interceptionStateContext.setState({ isRestoringUrl: false });
      return false;
    }

    // Forward navigation - always allow (we only guard back navigation)
    if (historyIndexDelta > 0) {
      if (DEBUG) console.log(`[Internal] Forward navigation (historyIndexDelta: ${historyIndexDelta})`);
      renderedStateContext.setState(
        computeRenderedStateWithNextHistoryIndex(currentRenderedState, nextHistoryIndex)
      );
      return true;
    }

    // Back navigation - this is what we guard
    if (DEBUG) console.log(`[Internal] Back navigation (historyIndexDelta: ${historyIndexDelta})`);

    // When handlerMap is empty (e.g., after once handler was deleted),
    // we still need to run preRegisteredHandler to handle overlay closures.
    // Unlike the session token mismatch case, here we must restore the URL
    // if preRegisteredHandler blocks, because the browser has already navigated.
    if (!hasRegisteredHandlers(handlerMap)) {
      if (preRegisteredHandler && !preRegisteredHandler()) {
        // Restore URL: browser already moved back, push forward to stay on current page
        window.history.go(-historyIndexDelta);
        return false;
      }
      if (DEBUG) console.log(`[Internal] No handlers`);
      renderedStateContext.setState(
        computeRenderedStateWithNextHistoryIndex(currentRenderedState, nextHistoryIndex)
      );
      return true;
    }

    // Restore URL first by going forward by the same delta, then run handlers
    if (DEBUG) console.log(`[Internal] Restoring URL with history.go(${-historyIndexDelta})`);
    window.history.go(-historyIndexDelta);

    // Run handlers asynchronously after URL restoration
    (async () => {
      const destinationPath = location.pathname + location.search;
      const shouldAllowNavigation = await runHandlerChainAndGetShouldAllowNavigation(handlerContext, destinationPath);
      if (shouldAllowNavigation) {
        if (DEBUG) console.log(`[Internal] Handler confirmed`);
        interceptionStateContext.setState({ isNavigationConfirmed: true });
        window.history.go(historyIndexDelta);
      } else {
        if (DEBUG) console.log(`[Internal] Handler blocked`);
      }
    })();
    return false;
  };
}
