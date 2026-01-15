import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { useContext } from "react";
import { HandlerDef } from "./@shared/types";
import { DEBUG } from "./@shared/debug";
import { useIsomorphicLayoutEffect } from "./@shared/useIsomorphicLayoutEffect";

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

function createPopstateHandler(
  handlerMap: Map<string, HandlerDef>,
  preRegisteredHandler?: () => boolean
) {
  const renderedStateContext = createRenderedStateContext();
  const interceptionStateContext = createInterceptionStateContext();
  const handlerContext: HandlerContext = { handlerMap, preRegisteredHandler };

  return (historyState: any = {}): boolean => {
    const { nextSessionToken, nextHistoryIndex } = parseHistoryState(historyState);
    const currentRenderedState = renderedStateContext.getState();
    const isSessionTokenMismatch = hasSessionTokenMismatch(
      nextSessionToken,
      currentRenderedState.sessionToken!
    );
    const historyIndexDelta = nextHistoryIndex - currentRenderedState.historyIndex;

    // ========================================
    // 이미 승인된 네비게이션
    // ========================================
    if (interceptionStateContext.getState().isNavigationConfirmed) {
      if (DEBUG) console.log(`[Confirmed] Navigation confirmed by handler`);
      interceptionStateContext.setState({ isNavigationConfirmed: false });
      renderedStateContext.setStateAndSyncToHistory(
        computeNextRenderedState(nextSessionToken, nextHistoryIndex)
      );
      return true;
    }

    // ========================================
    // Session Token Mismatch (새로고침, 외부 진입)
    // ========================================
    if (isSessionTokenMismatch) {
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

      if (!hasRegisteredHandlers(handlerMap)) {
        renderedStateContext.setStateAndSyncToHistory(
          computeNextRenderedState(nextSessionToken, nextHistoryIndex)
        );
        return true;
      }

      if (DEBUG) console.log(`[SessionTokenMismatch] Restoring URL with history.go(1)`);
      interceptionStateContext.setState({ isRestoringUrl: true });
      window.history.go(1);

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
    // Internal Navigation (일반 뒤로/앞으로)
    // ========================================

    if (historyIndexDelta === 0) {
      if (DEBUG) console.log(`[Internal] Ignoring (historyIndexDelta is 0)`);
      interceptionStateContext.setState({ isRestoringUrl: false });
      return false;
    }

    if (historyIndexDelta > 0) {
      if (DEBUG) console.log(`[Internal] Forward navigation (historyIndexDelta: ${historyIndexDelta})`);
      renderedStateContext.setState(
        computeRenderedStateWithNextHistoryIndex(currentRenderedState, nextHistoryIndex)
      );
      return true;
    }

    if (DEBUG) console.log(`[Internal] Back navigation (historyIndexDelta: ${historyIndexDelta})`);

    if (interceptionStateContext.getState().isNavigationConfirmed) {
      interceptionStateContext.setState({ isNavigationConfirmed: false });
      if (DEBUG) console.log(`[Internal] Already confirmed`);
      renderedStateContext.setState(
        computeRenderedStateWithNextHistoryIndex(currentRenderedState, nextHistoryIndex)
      );
      return true;
    }

    if (!hasRegisteredHandlers(handlerMap)) {
      if (DEBUG) console.log(`[Internal] No handlers`);
      renderedStateContext.setState(
        computeRenderedStateWithNextHistoryIndex(currentRenderedState, nextHistoryIndex)
      );
      return true;
    }

    if (DEBUG) console.log(`[Internal] Restoring URL with history.go(${-historyIndexDelta})`);
    window.history.go(-historyIndexDelta);

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
