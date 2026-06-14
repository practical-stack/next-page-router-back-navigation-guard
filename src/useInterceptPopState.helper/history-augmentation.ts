/**
 * History API Augmentation
 *
 * The History API exposes no stack index, so there's no native way to tell how far a
 * navigation moved or whether it was back or forward. (The Navigation API has
 * `navigation.currentEntry.index`, but Safari/Firefox don't support it.)
 *
 * Workaround: monkey-patch `history.pushState` / `history.replaceState` to inject our own
 * metadata into `history.state`:
 * - `__next_navigation_stack_index` — position in the stack (delta tells back from forward)
 * - `__next_session_token` — identifies the session (detects refresh / external entry)
 *
 * @see docs/01-why-this-library.md for the detailed explanation
 */

import { RenderedState } from "./types";
import { DEBUG, debug } from "../@shared/debug";

const SESSION_TOKEN_KEY = "__next_session_token";
const STACK_INDEX_KEY = "__next_navigation_stack_index";

// Capture the previous session's token + index at MODULE-EVALUATION time.
//
// The browser preserves the entry's history.state across a reload until ~the `load` event;
// Next.js Pages Router overwrites it slightly later, during router hydration (when our
// provider mounts). So a read at provider-mount time only sees Next's token-less rewrite.
// Module evaluation runs earlier — before hydration — so the previous token is still here.
//
// Recovering it lets the refreshed entry rejoin its original session, keeping back/forward
// distinguishable by index instead of every post-refresh popstate looking like a boundary.
const _capturedSessionStateAtModuleLoad: RenderedState | null =
  typeof window !== "undefined" &&
  window.history &&
  window.history.state &&
  window.history.state[SESSION_TOKEN_KEY]
    ? {
        sessionToken: window.history.state[SESSION_TOKEN_KEY],
        historyIndex: Number(window.history.state[STACK_INDEX_KEY]) || 0,
      }
    : null;

// Module-level singleton state
let _isHistoryStateSyncInitialized = false;
let _renderedState: RenderedState = { historyIndex: -1, sessionToken: "" };
let _setRenderedStateAndSyncToHistory: (params: {
  renderedState: RenderedState;
  shouldSyncToHistory: boolean;
}) => void = () => {};

/**
 * Generates a random session token for a brand-new session.
 *
 * Used only when there is no prior session to recover — a genuine first visit, or a
 * pushState/replaceState that runs before any token exists. After a refresh the previous
 * token is instead restored at module-eval (see _capturedSessionStateAtModuleLoad).
 */
export function generateSessionToken(): string {
  return Math.random().toString(36).substring(2);
}

/**
 * Returns an immutable copy of the current rendered state.
 */
export function getRenderedState(): RenderedState {
  return { ..._renderedState };
}

/**
 * Updates the module-level rendered state (immutable update).
 */
function setRenderedState(renderedState: RenderedState): void {
  _renderedState = { ...renderedState };
}

/**
 * Merges our tracking metadata into a history.state object.
 */
function withTrackingMetadata(
  historyState: any,
  { sessionToken, historyIndex }: RenderedState
) {
  return {
    ...historyState,
    [SESSION_TOKEN_KEY]: sessionToken,
    [STACK_INDEX_KEY]: historyIndex,
  };
}

/**
 * Builds a replacement for history.pushState / history.replaceState that keeps our
 * rendered state in sync and stamps tracking metadata onto every entry.
 *
 * pushState advances the index by one; replaceState keeps it. Both start a fresh session
 * if none exists yet.
 */
function createPatchedHistoryMethod(
  original: History["pushState"],
  advanceIndex: boolean
): History["pushState"] {
  return function (this: History, historyState, unused, url) {
    const current = getRenderedState();
    const next: RenderedState = current.sessionToken
      ? {
          sessionToken: current.sessionToken,
          historyIndex: current.historyIndex + (advanceIndex ? 1 : 0),
        }
      : { sessionToken: generateSessionToken(), historyIndex: 0 };

    setRenderedState(next);
    debug(
      `history.${advanceIndex ? "pushState" : "replaceState"}: index=${next.historyIndex}, token=${next.sessionToken}`
    );
    original.call(this, withTrackingMetadata(historyState, next), unused, url);
  };
}

/**
 * Initializes history state synchronization (singleton — runs once).
 *
 * Recovers the previous session if one was captured at module-eval, otherwise starts a
 * fresh one; seeds the current entry with metadata; and patches pushState/replaceState so
 * every subsequent entry is stamped.
 *
 * @returns Object with setRenderedStateAndSyncToHistory function
 */
export function initializeHistoryStateSyncOnce(): {
  setRenderedStateAndSyncToHistory: (params: {
    renderedState: RenderedState;
    shouldSyncToHistory: boolean;
  }) => void;
} {
  if (_isHistoryStateSyncInitialized) {
    return { setRenderedStateAndSyncToHistory: _setRenderedStateAndSyncToHistory };
  }

  debug("initializeHistoryStateSyncOnce: initializing");

  // Store original methods before patching
  const originalHistoryPushState = window.history.pushState;
  const originalHistoryReplaceState = window.history.replaceState;

  if (DEBUG) {
    (window as any).__next_navigation_debug = {
      originalHistoryPushState,
      originalHistoryReplaceState,
    };
  }

  // Recover the captured session (refresh) or start fresh (genuine first visit).
  if (_capturedSessionStateAtModuleLoad) {
    setRenderedState(_capturedSessionStateAtModuleLoad);
  } else {
    setRenderedState({ historyIndex: 0, sessionToken: generateSessionToken() });
  }
  debug(
    `initializeHistoryStateSyncOnce: initial index=${getRenderedState().historyIndex}, token=${getRenderedState().sessionToken}`
  );

  _setRenderedStateAndSyncToHistory = ({ renderedState, shouldSyncToHistory }) => {
    debug(
      `setRenderedStateAndSyncToHistory: index=${renderedState.historyIndex}, token=${renderedState.sessionToken}, sync=${shouldSyncToHistory}`
    );

    setRenderedState(renderedState);

    if (shouldSyncToHistory) {
      originalHistoryReplaceState.call(
        window.history,
        withTrackingMetadata(window.history.state, renderedState),
        "",
        window.location.href
      );
    }
  };

  // Seed metadata onto the current entry. The patched push/replace only stamp entries
  // created after patching, so the entry the user is already on has none. After a refresh
  // this re-stamps the RESTORED session (otherwise the recovered token would live only in
  // memory, with the on-disk entry still token-less); on a first visit it stamps the fresh
  // { index: 0, token }. In Next.js the guard is effectively always true (Next wipes the
  // metadata during init); it's kept for non-Next environments that may already carry it.
  // `== null` matches both null and undefined (a missing key reads back as undefined).
  if (
    !window.history.state ||
    window.history.state[STACK_INDEX_KEY] == null ||
    window.history.state[SESSION_TOKEN_KEY] == null
  ) {
    _setRenderedStateAndSyncToHistory({
      renderedState: getRenderedState(),
      shouldSyncToHistory: true,
    });
  }

  window.history.pushState = createPatchedHistoryMethod(originalHistoryPushState, true);
  window.history.replaceState = createPatchedHistoryMethod(originalHistoryReplaceState, false);

  _isHistoryStateSyncInitialized = true;

  return { setRenderedStateAndSyncToHistory: _setRenderedStateAndSyncToHistory };
}
