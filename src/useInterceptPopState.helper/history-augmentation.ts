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
 * @see docs/HISTORY_API_HACKS.md for detailed explanation
 */

import { RenderedState } from "./types";
import { DEBUG } from "../@shared/debug";

// Module-level singleton state
let _isHistoryStateSyncInitialized = false;
let _renderedState: RenderedState = { historyIndex: -1, sessionToken: "" };
let _setRenderedStateAndSyncToHistory: (params: {
  renderedState: RenderedState;
  shouldSyncToHistory: boolean;
}) => void = () => {};

/**
 * Generates a random session token to identify the current browser session.
 * Used to detect page refresh or external domain entry.
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
 * 1. Patches history.pushState to increment historyIndex on each call
 * 2. Patches history.replaceState to maintain current index
 * 3. Injects session token and index into history.state for tracking
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

  // Initialize state from existing history.state (if available)
  setRenderedState({
    historyIndex: parseInt(window.history.state.__next_navigation_stack_index) || 0,
    sessionToken: String(window.history.state.__next_session_token ?? "") || generateSessionToken(),
  });

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

  // Sync initial state to history if not already present
  if (
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

    if (nextRenderedState !== currentRenderedState) {
      setRenderedState(nextRenderedState);
    }

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
