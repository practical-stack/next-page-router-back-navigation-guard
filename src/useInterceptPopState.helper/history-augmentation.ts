/**
 * History API Augmentation
 *
 * Patches the browser's History API to track navigation stack index and session token.
 *
 * Problem: The History API doesn't expose a stack index - there's no way to know
 * the current position in the history stack or calculate the delta between navigations.
 * The Navigation API has `navigation.currentEntry.index` but Safari/Firefox don't support it.
 *
 * Solution: Monkey-patch `history.pushState` and `history.replaceState` to inject
 * custom metadata (__next_navigation_stack_index, __next_session_token) into history.state.
 * This allows us to track position and detect session changes (refresh, external entry).
 *
 * MDN References:
 * - History.pushState(): https://developer.mozilla.org/en-US/docs/Web/API/History/pushState
 *   Signature: pushState(state, unused, url?)
 *   "The unused parameter exists for historical reasons, and cannot be omitted;
 *    passing an empty string is safe against future changes to the method."
 *
 * - History.replaceState(): https://developer.mozilla.org/en-US/docs/Web/API/History/replaceState
 *   Signature: replaceState(state, unused, url?)
 *   Same signature as pushState, replaces current history entry instead of adding new one.
 *
 * @see docs/01-why-this-library.md for detailed explanation
 */

import { RenderedState } from "./types";
import { DEBUG } from "../@shared/debug";

// Capture the previous session's token + index at MODULE-EVALUATION time.
//
// The browser preserves the current entry's history.state across a reload until
// roughly the `load` event; Next.js Pages Router only overwrites it slightly later,
// during router hydration — which is also when this library's provider mounts. A read
// at provider-mount time therefore always sees Next's freshly-rewritten (token-less)
// state and cannot recover the previous token. Module evaluation runs earlier, during
// bundle execution before hydration, so the previous token is still readable here.
//
// Recovering it lets the refreshed entry rejoin its original session, so back/forward
// stay distinguishable by index after a refresh instead of every popstate looking like
// a session-boundary mismatch (which forced forward navigation to be misread as back).
const _capturedSessionStateAtModuleLoad: RenderedState | null =
  typeof window !== "undefined" &&
  window.history &&
  window.history.state &&
  window.history.state.__next_session_token
    ? {
        sessionToken: window.history.state.__next_session_token,
        historyIndex:
          Number(window.history.state.__next_navigation_stack_index) || 0,
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
 * Generates a random session token.
 *
 * Each page load always produces a new token. Next.js Pages Router overwrites
 * `history.state` during initialization, before this library's provider mounts,
 * so the previous session's token cannot be recovered. As a consequence, every
 * popstate event after a refresh (both back and forward) is seen as a token
 * mismatch, which means forward navigation is also treated like back navigation.
 *
 * Note: back navigation from an external domain does not fire a popstate in
 * this document's context and is therefore outside this library's scope.
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
 * Initializes history state synchronization (singleton - only runs once).
 *
 * This function:
 * 1. Starts with a fresh session token and initial historyIndex (0)
 * 2. Patches history.pushState to increment historyIndex on each call
 * 3. Patches history.replaceState to maintain current index
 * 4. Injects session token and index into history.state for tracking
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

  if (DEBUG) console.log("initializeHistoryStateSyncOnce: initializing");

  // Store original methods before patching
  const originalHistoryPushState = window.history.pushState;
  const originalHistoryReplaceState = window.history.replaceState;

  if (DEBUG) {
    (window as any).__next_navigation_debug = {
      originalHistoryPushState,
      originalHistoryReplaceState,
    };
  }

  // Restore the previous session if we captured one at module-eval time (before
  // Next wiped history.state); otherwise start a fresh session. Restoring makes the
  // refreshed entry rejoin its original session so back/forward after a refresh are
  // told apart by index, fixing the direction-ambiguity limitation.
  if (_capturedSessionStateAtModuleLoad) {
    if (DEBUG)
      console.log(
        `initializeHistoryStateSyncOnce: restoring session token=${_capturedSessionStateAtModuleLoad.sessionToken}, index=${_capturedSessionStateAtModuleLoad.historyIndex}`
      );
    setRenderedState(_capturedSessionStateAtModuleLoad);
  } else {
    setRenderedState({
      historyIndex: 0,
      sessionToken: generateSessionToken(),
    });
  }

  if (DEBUG) {
    const currentRenderedState = getRenderedState();
    console.log(
      `initializeHistoryStateSyncOnce: initial historyIndex=${currentRenderedState.historyIndex}, sessionToken=${currentRenderedState.sessionToken}`
    );
  }

  // Create the state update function
  _setRenderedStateAndSyncToHistory = ({
    renderedState,
    shouldSyncToHistory,
  }: {
    renderedState: RenderedState;
    shouldSyncToHistory: boolean;
  }) => {
    if (DEBUG) {
      console.log(
        `setRenderedStateAndSyncToHistory: historyIndex=${renderedState.historyIndex}, sessionToken=${renderedState.sessionToken}, shouldSyncToHistory=${shouldSyncToHistory}`
      );
    }

    setRenderedState(renderedState);

    // Optionally sync to history.state via replaceState
    if (shouldSyncToHistory) {
      const modifiedHistoryState = {
        ...window.history.state,
        __next_session_token: renderedState.sessionToken,
        __next_navigation_stack_index: renderedState.historyIndex,
      };

      originalHistoryReplaceState.call(
        window.history,
        modifiedHistoryState,
        "",
        window.location.href
      );
    }
  };

  // Bootstrap metadata onto the current history entry.
  // The patched pushState/replaceState only inject metadata into entries created
  // after patching, so the entry the user is already sitting on has none — we seed
  // it with the current rendered state, otherwise a later back navigation to it
  // would read empty metadata (missing index forces 0, missing token forces a
  // session mismatch).
  //
  // What we write is the rendered state set just above. After a refresh that is the
  // RESTORED session (token + index captured at module-eval), so this step re-stamps
  // the current entry and is what makes it rejoin its original session — without it,
  // the restored token would live only in memory and the entry on disk would still be
  // token-less. On a genuine first visit there is nothing to restore, so it is a fresh
  // { index: 0, token }.
  //
  // In Next.js Pages Router the condition is effectively always true: Next overwrites
  // history.state during init (before our provider mounts), wiping the entry's
  // metadata — so we always re-inject. The check is kept for non-Next environments (or
  // if Next's behavior changes) where the entry already carries valid metadata; then
  // we leave it untouched.
  //
  // `== null` (not `===`) matches both null and undefined, since a missing key reads
  // back as undefined.
  if (
    !window.history.state ||
    window.history.state.__next_navigation_stack_index == null ||
    window.history.state.__next_session_token == null
  ) {
    _setRenderedStateAndSyncToHistory({ renderedState: getRenderedState(), shouldSyncToHistory: true });
  }

  // Patch pushState: increment index on each navigation
  window.history.pushState = function (historyState, unused, url) {
    const currentRenderedState = getRenderedState();
    const nextRenderedState: RenderedState = currentRenderedState.sessionToken
      ? { sessionToken: currentRenderedState.sessionToken, historyIndex: currentRenderedState.historyIndex + 1 }
      : { sessionToken: generateSessionToken(), historyIndex: 0 };

    setRenderedState(nextRenderedState);

    if (DEBUG) {
      console.log(`history.pushState: historyIndex=${nextRenderedState.historyIndex}, sessionToken=${nextRenderedState.sessionToken}`);
    }

    // Inject our tracking metadata into the state object
    const modifiedHistoryState = {
      ...historyState,
      __next_session_token: nextRenderedState.sessionToken,
      __next_navigation_stack_index: nextRenderedState.historyIndex,
    };
    originalHistoryPushState.call(this, modifiedHistoryState, unused, url);
  };

  // Patch replaceState: maintain current index, just update state
  window.history.replaceState = function (historyState, unused, url) {
    const currentRenderedState = getRenderedState();
    const nextRenderedState: RenderedState = currentRenderedState.sessionToken
      ? currentRenderedState
      : { sessionToken: generateSessionToken(), historyIndex: 0 };

    setRenderedState(nextRenderedState);

    if (DEBUG) {
      console.log(`history.replaceState: historyIndex=${nextRenderedState.historyIndex}, sessionToken=${nextRenderedState.sessionToken}`);
    }

    const modifiedHistoryState = {
      ...historyState,
      __next_session_token: nextRenderedState.sessionToken,
      __next_navigation_stack_index: nextRenderedState.historyIndex,
    };
    originalHistoryReplaceState.call(this, modifiedHistoryState, unused, url);
  };

  _isHistoryStateSyncInitialized = true;

  return { setRenderedStateAndSyncToHistory: _setRenderedStateAndSyncToHistory };
}
