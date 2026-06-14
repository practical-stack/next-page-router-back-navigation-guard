/**
 * Popstate Interception Hook
 *
 * Intercepts browser back/forward navigation in Next.js Pages Router.
 * This module handles the core popstate event interception logic.
 *
 * Key Concepts:
 * - Session Token: A unique identifier for the current browser session. The token is
 *   recovered across a refresh (captured at module-eval), so a refresh stays in-session;
 *   a token mismatch instead marks a genuine session boundary (missing/cross-session entry).
 * - History Index: Tracks position in the history stack to calculate navigation delta.
 * - Interception Flow: Restore URL first, run handlers, then allow/block navigation.
 *
 * MDN References:
 * - History.go(): https://developer.mozilla.org/en-US/docs/Web/API/History/go
 *   "This method is asynchronous. Add a listener for the popstate event
 *    in order to determine when the navigation has completed."
 * - History.back(): https://developer.mozilla.org/en-US/docs/Web/API/History/back
 *   Equivalent to history.go(-1). Also asynchronous.
 * - popstate event: https://developer.mozilla.org/en-US/docs/Web/API/Window/popstate_event
 *   Fired when the active history entry changes (back/forward/go).
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
 * 2. Session token mismatch - Genuine session boundary (missing/cross-session entry; not a normal refresh)
 * 3. Internal navigation - Normal back/forward within the app
 */
function createPopstateHandler(
  handlerMap: Map<string, HandlerDef>,
  preRegisteredHandler?: () => boolean
): PopstateHandler {
  const renderedStateContext = createRenderedStateContext();
  const interceptionStateContext = createInterceptionStateContext();
  const handlerContext: HandlerContext = { handlerMap, preRegisteredHandler };

  // Runs the pending handler exactly once after a back-navigation URL restore.
  //
  // It can be triggered from two places: the normal delta===0 follow-up popstate, or
  // the refresh-safe fallback below. After a refresh, Next.js does NOT invoke
  // beforePopState for the synthetic history.go() restore, so the follow-up popstate
  // never reaches us and the fallback is what fires. (Root cause — Next's isSsr
  // initial-load guard in onPopState — is documented in full, with Next.js v14.2.0
  // source links, at the back-navigation branch that schedules the fallback below.)
  // The pendingHandlerExecution flag is cleared synchronously here, so whichever
  // trigger runs first wins and the other becomes a no-op — guaranteeing exactly-once
  // execution.
  const runPendingHandlerOnce = (): void => {
    const { pendingHandlerExecution, pendingHistoryIndexDelta } =
      interceptionStateContext.getState();
    if (!pendingHandlerExecution) return;
    interceptionStateContext.setState({ pendingHandlerExecution: false });

    (async () => {
      const destinationPath = location.pathname + location.search;
      const shouldAllowNavigation =
        await runHandlerChainAndGetShouldAllowNavigation(handlerContext, destinationPath);
      if (shouldAllowNavigation) {
        if (DEBUG) console.log(`[Internal] Handler confirmed`);
        interceptionStateContext.setState({ isNavigationConfirmed: true });
        window.history.go(pendingHistoryIndexDelta);
      } else {
        if (DEBUG) console.log(`[Internal] Handler blocked`);
      }
    })();
  };

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
      // setState (no history sync) is sufficient here. We arrived at this entry via our
      // own history.go()/back(), so its history.state already holds the correct
      // {index, token}. computeNextRenderedState() simply re-derives those same values
      // from what we just parsed off this entry, so a replaceState would only write back
      // identical data (idempotent). Only the in-memory pointer needs to move.
      // (Verified: switching this from setStateAndSyncToHistory to setState keeps all E2E green.)
      renderedStateContext.setState(
        computeNextRenderedState(nextSessionToken, nextHistoryIndex)
      );
      return true;
    }

    // ========================================
    // Session Token Mismatch (Genuine Session Boundary)
    // ========================================
    // Safety net / graceful-degradation path — NOT reached in a normal SPA flow (Provider in
    // _app, every entry stamped, refresh restores the token). It exists for the edge cases
    // below; removing it would make a missing/foreign token be mishandled as internal
    // navigation with a meaningless index delta.
    //
    // A normal page refresh no longer reaches this branch. initializeHistoryStateSyncOnce()
    // recovers the previous session token (captured at module-evaluation time, before Next
    // overwrites history.state), so the refreshed entry rejoins its original session and is
    // handled as internal navigation by index.
    //
    // This branch now fires only at a genuine session boundary: the landing entry has no
    // metadata (it predates the library or was written externally), or it carries a token
    // from a different session (e.g. when there was no token to recover at module-eval and a
    // fresh session was started). Across such a boundary the previous session's historyIndex
    // is not comparable, so we cannot tell back from forward — we assume back and restore the
    // URL with history.go(1).
    //
    // Note: back navigation from an external domain does not fire a popstate
    // in this document's context and is therefore not handled here.
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
      //
      // URL Restoration on Block:
      // When preRegisteredHandler blocks (returns false), we MUST restore the URL
      // with history.go(1). Without this, the browser URL changes to the previous
      // page while Next.js still renders the current page, causing desync.
      //
      // Example scenario (once: true handler at a session boundary):
      // 1. First back: handler runs, blocks, gets deleted (once: true)
      // 2. Second back: no handlers, preRegisteredHandler closes modal, blocks
      //    → Without history.go(1), browser URL is now at home page
      // 3. Third back: browser tries to go before home → about:blank!
      //
      // With history.go(1), the URL is restored after step 2, so step 3 works correctly.
      if (!hasRegisteredHandlers(handlerMap)) {
        if (preRegisteredHandler && !preRegisteredHandler()) {
          window.history.go(1);
          return false;
        }
        // setState (no history sync) is sufficient here. This pass-through path did NOT
        // call history.go(1), so the browser is sitting on the entry the back landed on,
        // and computeNextRenderedState() re-derives that same entry's parsed {index, token}.
        // A replaceState would only write identical data back (idempotent); the meaningful
        // change is the in-memory pointer adopting this entry's (older) session token so
        // subsequent popstates stop reporting a mismatch.
        // (Verified: switching this from setStateAndSyncToHistory to setState keeps all E2E green.)
        renderedStateContext.setState(
          computeNextRenderedState(nextSessionToken, nextHistoryIndex)
        );
        return true;
      }

      if (DEBUG) console.log(`[SessionTokenMismatch] Restoring URL with history.go(1)`);
      interceptionStateContext.setState({ isRestoringUrl: true });
      window.history.go(1);

      // NOTE: We cannot use the pendingHandlerExecution pattern (waiting for historyIndexDelta === 0)
      // here because across a session boundary the historyIndex is not comparable, so delta-based
      // detection of when history.go(1) completes is unreliable. Instead, we use rAF + setTimeout to
      // wait for the browser to settle after history.go(1).
      // @see https://developer.mozilla.org/en-US/docs/Web/API/History/go
      requestAnimationFrame(() => {
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
      });
      return false;
    }

    // ========================================
    // Internal Navigation (Normal Back/Forward)
    // ========================================
    // Normal navigation within the app where session token matches.
    // Delta calculation: positive = forward, negative = back, zero = no-op

    // Delta is 0 when URL was restored by history.go(-delta).
    // If pendingHandlerExecution is true, this popstate signals that history.go()
    // has completed, so we can now safely run the handler.
    // @see https://developer.mozilla.org/en-US/docs/Web/API/History/go
    // MDN: "This method is asynchronous. Add a listener for the popstate event
    // in order to determine when the navigation has completed."
    if (historyIndexDelta === 0) {
      const { pendingHandlerExecution } = interceptionStateContext.getState();

      if (pendingHandlerExecution) {
        if (DEBUG) console.log(`[Internal] history.go() completed, running pending handler`);
        runPendingHandlerOnce();
        return false;
      }

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

    // Restore URL first, then run the handler once the restore completes.
    // Normally the delta===0 follow-up popstate (via beforePopState) signals
    // completion. But after a refresh, Next.js does NOT invoke beforePopState for our
    // synthetic history.go() restore, so that follow-up never arrives.
    //
    // Root cause (Next.js Pages Router; logic unchanged from v14.2.0 through v16.2.9,
    // the latest stable verified — only line numbers differ between versions):
    // The router's internal onPopState reaches our beforePopState callback (this._bps)
    // only at the very end, AFTER an "initial load" guard:
    //
    //     // Make sure we don't re-render on initial load,
    //     // can be caused by navigating back from an external site
    //     if (this.isSsr && as === addBasePath(this.asPath) &&
    //         pathname === addBasePath(this.pathname)) { return }   // returns BEFORE _bps
    //     ...
    //     if (this._bps && !this._bps(state)) { return }            // our callback
    //
    // `this.isSsr` starts true on every page load (incl. refresh) and is only flipped to
    // false inside change(), which runs on a client-side navigation. After a refresh the
    // user's first action is Back: we block it (return false), so change() never runs and
    // isSsr stays true. Our history.go() restore then lands back on the SAME url Next.js is
    // rendering, so `as === this.asPath` && isSsr === true → the guard returns early and
    // _bps (our handler) is never called. Without a refresh, the page was reached via
    // client navigation (isSsr already false), the guard is skipped, and the normal
    // delta===0 popstate works — which is why the fallback only matters post-refresh.
    //
    // Next.js v14.2.0 source (packages/next/src/shared/lib/router/router.ts):
    //   onPopState:            https://github.com/vercel/next.js/blob/v14.2.0/packages/next/src/shared/lib/router/router.ts#L898
    //   isSsr initial-load guard: https://github.com/vercel/next.js/blob/v14.2.0/packages/next/src/shared/lib/router/router.ts#L969-L977
    //   _bps (beforePopState):    https://github.com/vercel/next.js/blob/v14.2.0/packages/next/src/shared/lib/router/router.ts#L981
    //   this.isSsr = true (init): https://github.com/vercel/next.js/blob/v14.2.0/packages/next/src/shared/lib/router/router.ts#L819
    //   this.isSsr = false (change): https://github.com/vercel/next.js/blob/v14.2.0/packages/next/src/shared/lib/router/router.ts#L1155
    // Same logic in latest stable v16.2.9 (line numbers shifted):
    //   onPopState L900 · isSsr guard L971-L979 · _bps L983 · isSsr=true L821 · isSsr=false L1243
    //   https://github.com/vercel/next.js/blob/v16.2.9/packages/next/src/shared/lib/router/router.ts#L971-L979
    //
    // We therefore also schedule a refresh-safe fallback (rAF + setTimeout, per MDN's
    // guidance for detecting history.go() completion) that bypasses Next's popstate path
    // entirely. runPendingHandlerOnce() is idempotent via the pendingHandlerExecution flag,
    // so whichever trigger fires first wins.
    // @see https://developer.mozilla.org/en-US/docs/Web/API/History/go
    if (DEBUG) console.log(`[Internal] Restoring URL with history.go(${-historyIndexDelta})`);
    interceptionStateContext.setState({
      pendingHandlerExecution: true,
      pendingHistoryIndexDelta: historyIndexDelta,
    });
    window.history.go(-historyIndexDelta);
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (interceptionStateContext.getState().pendingHandlerExecution) {
          if (DEBUG) console.log(`[Internal] Follow-up popstate did not arrive (post-refresh); running handler via fallback`);
          runPendingHandlerOnce();
        }
      }, 0);
    });
    return false;
  };
}
