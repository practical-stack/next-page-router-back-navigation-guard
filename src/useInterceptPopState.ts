/**
 * Popstate Interception Hook
 *
 * Intercepts browser back navigation in Next.js Pages Router via the router's
 * `beforePopState` API. Returning `false` from beforePopState prevents Next.js from
 * handling the navigation, letting us restore the URL, run handlers, then decide whether
 * to allow or block.
 *
 * Two values stamped into `history.state` drive the logic (see history-augmentation.ts):
 * - Session token: identifies the browser session. Recovered across a refresh, so a
 *   refresh stays in-session; a mismatch instead marks a genuine session boundary.
 * - History index: position in the stack, used to compute the navigation delta
 *   (negative = back, positive = forward).
 */

import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { useContext } from "react";
import { HandlerDef } from "./@shared/types";
import { debug } from "./@shared/debug";
import { useIsomorphicLayoutEffect } from "./@shared/useIsomorphicLayoutEffect";

import type { NextHistoryState, RenderedState } from "./useInterceptPopState.helper/types";
import { createInterceptionStateContext } from "./useInterceptPopState.helper/interception-state";
import { createPendingHandlerRestore } from "./useInterceptPopState.helper/pending-handler-restore";
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
 * Registers the popstate interception on the Pages Router via `beforePopState`.
 *
 * @param params.handlerMap - Registered back-navigation handlers, keyed by id.
 * @param params.preRegisteredHandler - Optional fallback handler (e.g. an overlay closer)
 *   run when no handlers are registered in `handlerMap`.
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
    const popstateHandler = createPopstateHandler({ handlerMap, preRegisteredHandler });

    if (pagesRouter) {
      pagesRouter.beforePopState(() => popstateHandler(window.history.state));

      return () => {
        pagesRouter.beforePopState(() => true);
      };
    }
  }, [pagesRouter, preRegisteredHandler]);
}

/**
 * Builds the popstate handler, which dispatches each event to one of three scenarios:
 * 1. Confirmed navigation — a handler already approved; allow the follow-up popstate.
 * 2. Session boundary — token mismatch (missing/foreign entry); restore via history.go(1).
 * 3. Internal navigation — normal back/forward within the session, distinguished by delta.
 *
 * @param params.handlerMap - Registered back-navigation handlers, keyed by id.
 * @param params.preRegisteredHandler - Optional fallback handler run when `handlerMap` is empty.
 * @returns A handler that takes the current `history.state` and returns whether Next.js
 *   should proceed with the navigation (`true`) or be blocked (`false`).
 */
function createPopstateHandler({
  handlerMap,
  preRegisteredHandler,
}: {
  handlerMap: Map<string, HandlerDef>;
  preRegisteredHandler?: () => boolean;
}): PopstateHandler {
  const renderedStateContext = createRenderedStateContext();
  const interceptionStateContext = createInterceptionStateContext();
  const pendingRestore = createPendingHandlerRestore();
  const handlerContext: HandlerContext = { handlerMap, preRegisteredHandler };

  /**
   * history.go() is asynchronous. MDN's recommended way to detect completion is the
   * popstate event, and the normal back path does exactly that — it waits for the
   * follow-up `delta === 0` popstate (see handleInternalNavigation).
   *
   * This helper is the refresh-safe fallback for the pendingRestore completion mechanism.
   * Normally the follow-up `delta === 0` popstate fires runPendingHandlerOnce; the fallback
   * matters when that popstate can't be relied on — post-refresh, Next.js skips beforePopState
   * for our synthetic go() restore, so it never arrives (see handleInternalNavigation).
   * Both callers schedule it: the internal-back path, and the session-boundary restore, which
   * also routes through pendingRestore (setPending(-1) + go(1); see handleSessionBoundary).
   *
   * With no usable popstate, we fall back to the community "run after the next paint"
   * idiom: rAF fires just before paint (after the history entry is swapped) and the
   * nested setTimeout(0) yields one more task, landing after the location update has
   * settled. Equivalent variants exist (double rAF, rAF + MessageChannel) and would work
   * here too; the exact timing isn't load-bearing.
   *
   * IMPORTANT: this is a heuristic, NOT a spec-sanctioned completion signal — no
   * reference ties rAF+setTimeout to history.go() finishing; popstate is the only such
   * signal. Correctness does not depend on the timing being precise. It is guaranteed by
   * the idempotency of pendingRestore: whichever trigger fires first (popstate or this
   * fallback) consumes the pending restore and the other becomes a no-op. So this only
   * needs to run "at least once, not too early" — if popstate already ran, this is inert.
   *
   * @param callback - Run once the browser has applied the history navigation.
   * @see https://developer.mozilla.org/en-US/docs/Web/API/History/go
   * @see https://jakearchibald.com/2015/tasks-microtasks-queues-and-schedules/
   */
  const afterHistoryGoSettles = (callback: () => void): void => {
    requestAnimationFrame(() => setTimeout(callback, 0));
  };

  /**
   * Runs the pending handler exactly once after a back-navigation URL restore. Triggered
   * by whichever fires first — the normal delta===0 follow-up popstate, or the
   * refresh-safe fallback (see handleInternalNavigation). The flag is cleared
   * synchronously, so the other trigger becomes a no-op.
   */
  const runPendingHandlerOnce = (): void => {
    const consumedRestore = pendingRestore.consume();
    if (!consumedRestore) return;

    void (async () => {
      const destinationPath = location.pathname + location.search;
      const shouldAllow = await runHandlerChainAndGetShouldAllowNavigation(
        handlerContext,
        destinationPath
      );
      if (!shouldAllow) {
        debug("[Internal] Handler blocked");
        return;
      }
      debug("[Internal] Handler confirmed");
      interceptionStateContext.setState({ isNavigationConfirmed: true });
      window.history.go(consumedRestore.delta);
    })();
  };

  /**
   * Scenario 1 — the handler approved navigation and triggered history.back()/go(), which
   * produced this popstate. Allow it through. The entry's history.state already holds the
   * correct {index, token}, so only the in-memory pointer needs to move (no history sync).
   *
   * @param params.nextSessionToken - Session token of the landed entry.
   * @param params.nextHistoryIndex - History index of the landed entry.
   * @returns Always `true` — the confirmed navigation is allowed through.
   */
  const handleConfirmedNavigation = ({
    nextSessionToken,
    nextHistoryIndex,
  }: {
    nextSessionToken: string | undefined;
    nextHistoryIndex: number;
  }): boolean => {
    debug("[Confirmed] Navigation confirmed by handler");
    interceptionStateContext.setState({ isNavigationConfirmed: false });
    renderedStateContext.setState(computeNextRenderedState(nextSessionToken, nextHistoryIndex));
    return true;
  };

  /**
   * Scenario 2 — token mismatch marks a genuine session boundary, NOT a normal refresh
   * (refreshes recover their token at module-eval; see history-augmentation.ts). It fires
   * when the landing entry has no metadata (predates the library / written externally) or
   * carries a foreign token. The previous session's index isn't comparable across the
   * boundary, so we can't tell back from forward — we assume back and restore via go(1).
   *
   * @param params.nextSessionToken - Session token of the landed entry.
   * @param params.nextHistoryIndex - History index of the landed entry.
   * @param params.currentRenderedState - The rendered state before this popstate.
   * @returns `false` (block) while restoring/handling, `true` only on the pass-through path.
   */
  const handleSessionBoundary = ({
    nextSessionToken,
    nextHistoryIndex,
    currentRenderedState,
  }: {
    nextSessionToken: string | undefined;
    nextHistoryIndex: number;
    currentRenderedState: RenderedState;
  }): boolean => {
    debug(
      `[SessionTokenMismatch] Detected (current: ${currentRenderedState.sessionToken}, next: ${nextSessionToken})`
    );

    /**
     * Empty-handlerMap fast path: only the preRegisteredHandler (e.g. an overlay closer)
     * remains. Calling it runs that handler (which may close an overlay — a side effect).
     * If it blocks, restore the URL with go(1) and stop; otherwise record the landed entry
     * as the new rendered state and allow.
     *
     * Restoring on block is essential: without it the browser URL moves to the previous page
     * while Next.js still renders the current one. Worst case (a `once` handler at a session
     * boundary): 1st back blocks + deletes the handler, 2nd back closes the modal — if the
     * URL isn't restored the page is now at home, so a 3rd back leaves the site (about:blank).
     */
    if (!hasRegisteredHandlers(handlerMap)) {
      if (preRegisteredHandler && !preRegisteredHandler()) {
        // Case 2: this go(1) lands on the matching-token entry; its echo is swallowed by the
        // delta===0 / no-pending branch in handleInternalNavigation.
        window.history.go(1);
        return false;
      }
      renderedStateContext.setState(computeNextRenderedState(nextSessionToken, nextHistoryIndex));
      return true;
    }

    /**
     * Restore the URL with go(1), then reuse the internal-back completion path.
     *
     * The boundary index isn't comparable across sessions, so we can't compute the delta —
     * we assume back-by-one and restore with go(1) (rather than go(-delta)). The go(1) echo
     * lands back on our matching-token entry at delta===0, so setPending(-1) lets
     * handleInternalNavigation's "delta===0 && pending" branch drive runPendingHandlerOnce —
     * exactly as a normal back does. runPendingHandlerOnce also carries the refresh-safe
     * fallback, so the explicit afterHistoryGoSettles below is just that same fallback in case
     * the echo popstate never arrives.
     *
     * This unifies the boundary leave with the internal-back path. Verified (2026-06-14) to
     * stay green under a genuine token-σ boundary (e2e/token-boundary.spec.ts) on all 3
     * browsers. The earlier bespoke path additionally called setStateAndSyncToHistory to stamp
     * the entry, which turned out not to be load-bearing (sync-removed kept the suite green too).
     * One nuance vs. the old path: the handler now receives the restored entry's path as `to`
     * instead of "" — invisible to the public `() => boolean` handler.
     */
    debug("[SessionTokenMismatch] Restoring URL with history.go(1)");
    pendingRestore.setPending(-1);
    window.history.go(1);
    afterHistoryGoSettles(() => {
      if (pendingRestore.isPending()) {
        runPendingHandlerOnce();
      }
    });
    return false;
  };

  /**
   * Scenario 3 — normal in-session navigation, classified by the index delta.
   *
   * @param params.nextHistoryIndex - History index of the landed entry.
   * @param params.currentRenderedState - The rendered state before this popstate.
   * @returns `true` to allow (forward / no-op pass-through), `false` to block (back guard).
   */
  const handleInternalNavigation = ({
    nextHistoryIndex,
    currentRenderedState,
  }: {
    nextHistoryIndex: number;
    currentRenderedState: RenderedState;
  }): boolean => {
    const historyIndexDelta = nextHistoryIndex - currentRenderedState.historyIndex;

    /**
     * delta === 0 with a pending restore: a self-induced go() restore just completed. Both the
     * internal-back go(-delta) and the session-boundary restore go(1) (which sets pending via
     * setPending(-1)) land here. This popstate signals history.go() finished, so run the
     * deferred handler now.
     */
    if (historyIndexDelta === 0 && pendingRestore.isPending()) {
      debug("[Internal] history.go() completed, running pending handler");
      runPendingHandlerOnce();
      return false;
    }

    /**
     * delta === 0 with NO pending restore: the echo of a self-induced go() that carried no
     * deferred handler. Two call sites land here, both empty-handlerMap blocks where the
     * preRegisteredHandler ran and blocked:
     *   1. Internal-back empty-handlerMap block — go(-delta).
     *   2. Session-boundary empty-handlerMap block — go(1).
     * Case 2 originates in handleSessionBoundary, but its go(1) lands back on our matching-token
     * entry, so the echo is re-dispatched here (token now matches). Either way it's just the
     * echo of our own restore, so swallow it. (The session-boundary restore WITH handlers does
     * set pending, so it takes the pending branch above, not this one.)
     */
    if (historyIndexDelta === 0) {
      debug("[Internal] Ignoring (historyIndexDelta is 0)");
      return false;
    }

    /** Forward navigation — always allowed; we only guard back. */
    if (historyIndexDelta > 0) {
      debug(`[Internal] Forward navigation (historyIndexDelta: ${historyIndexDelta})`);
      renderedStateContext.setState(
        computeRenderedStateWithNextHistoryIndex(currentRenderedState, nextHistoryIndex)
      );
      return true;
    }

    /** Back navigation — the case we guard. */
    debug(`[Internal] Back navigation (historyIndexDelta: ${historyIndexDelta})`);

    /**
     * Empty-handlerMap fast path. Running the preRegisteredHandler may close an overlay (a
     * side effect); if it blocks, restore the URL with go(-delta) and stop, otherwise record
     * the landed entry as the new rendered state and allow. See handleSessionBoundary for the
     * full rationale on why the URL must be restored on block.
     */
    if (!hasRegisteredHandlers(handlerMap)) {
      if (preRegisteredHandler && !preRegisteredHandler()) {
        // Case 1: this go(-delta) restores the original entry (token already matches); its
        // echo re-enters here at delta===0 with nothing pending and is swallowed.
        window.history.go(-historyIndexDelta);
        return false;
      }
      renderedStateContext.setState(
        computeRenderedStateWithNextHistoryIndex(currentRenderedState, nextHistoryIndex)
      );
      return true;
    }

    /**
     * Restore the URL first, then run the handler once the restore completes. Normally the
     * delta===0 follow-up popstate signals completion — but after a refresh Next.js skips
     * beforePopState for our synthetic go() restore, so that follow-up never arrives.
     *
     * Root cause (Next.js Pages Router, unchanged v14.2.0 → v16.2.9): onPopState reaches
     * our beforePopState (_bps) only after an "initial load" guard that returns early when
     * `this.isSsr && as === asPath && pathname === pathname`. isSsr starts true on every
     * load and only flips false inside change() (a client navigation). Post-refresh the
     * first action is Back: we block it (change() never runs, isSsr stays true) and the
     * go() restore lands on the same URL Next is rendering → guard returns, _bps is skipped.
     * @see https://github.com/vercel/next.js/blob/v14.2.0/packages/next/src/shared/lib/router/router.ts#L969-L981
     *
     * So we also schedule a refresh-safe fallback that bypasses Next's popstate path.
     * runPendingHandlerOnce() is idempotent, so whichever trigger fires first wins.
     */
    debug(`[Internal] Restoring URL with history.go(${-historyIndexDelta})`);
    pendingRestore.setPending(historyIndexDelta);
    window.history.go(-historyIndexDelta);
    afterHistoryGoSettles(() => {
      if (pendingRestore.isPending()) {
        debug("[Internal] Follow-up popstate did not arrive (post-refresh); running fallback");
        runPendingHandlerOnce();
      }
    });
    return false;
  };

  return (historyState: NextHistoryState = {}): boolean => {
    const { nextSessionToken, nextHistoryIndex } = parseHistoryState(historyState);
    const currentRenderedState = renderedStateContext.getState();

    if (interceptionStateContext.getState().isNavigationConfirmed) {
      return handleConfirmedNavigation({ nextSessionToken, nextHistoryIndex });
    }

    if (hasSessionTokenMismatch(nextSessionToken, currentRenderedState.sessionToken)) {
      return handleSessionBoundary({ nextSessionToken, nextHistoryIndex, currentRenderedState });
    }

    return handleInternalNavigation({ nextHistoryIndex, currentRenderedState });
  };
}
