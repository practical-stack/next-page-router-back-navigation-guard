import { RenderedState } from "./types";
import { DEBUG } from "../@shared/debug";

let _isHistoryStateSyncInitialized = false;
let _renderedState: RenderedState = { historyIndex: -1, sessionToken: "" };
let _setRenderedStateAndSyncToHistory: (params: {
  renderedState: RenderedState;
  shouldSyncToHistory: boolean;
}) => void = () => {};

export function generateSessionToken(): string {
  return Math.random().toString(36).substring(2);
}

export function getRenderedState(): RenderedState {
  return { ..._renderedState };
}

function setRenderedState(renderedState: RenderedState): void {
  _renderedState = { ...renderedState };
}

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

  const originalHistoryPushState = window.history.pushState;
  const originalHistoryReplaceState = window.history.replaceState;

  if (DEBUG) {
    (window as any).__next_navigation_debug = {
      originalHistoryPushState,
      originalHistoryReplaceState,
    };
  }

  setRenderedState({
    historyIndex: parseInt(window.history.state.__next_navigation_stack_index) || 0,
    sessionToken: String(window.history.state.__next_session_token ?? "") || generateSessionToken(),
  });

  if (DEBUG) {
    const currentRenderedState = getRenderedState();
    console.log(
      `setupHistoryStateSync: initial historyIndex=${currentRenderedState.historyIndex}, sessionToken=${currentRenderedState.sessionToken}`
    );
  }

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

  if (
    window.history.state.__next_navigation_stack_index == null ||
    window.history.state.__next_session_token == null
  ) {
    _setRenderedStateAndSyncToHistory({ renderedState: getRenderedState(), shouldSyncToHistory: true });
  }

  window.history.pushState = function (historyState, unused, url) {
    const currentRenderedState = getRenderedState();
    const nextRenderedState: RenderedState = currentRenderedState.sessionToken
      ? { sessionToken: currentRenderedState.sessionToken, historyIndex: currentRenderedState.historyIndex + 1 }
      : { sessionToken: generateSessionToken(), historyIndex: 0 };

    setRenderedState(nextRenderedState);

    if (DEBUG) {
      console.log(`history.pushState: historyIndex=${nextRenderedState.historyIndex}, sessionToken=${nextRenderedState.sessionToken}`);
    }

    const modifiedHistoryState = {
      ...historyState,
      __next_session_token: nextRenderedState.sessionToken,
      __next_navigation_stack_index: nextRenderedState.historyIndex,
    };
    originalHistoryPushState.call(this, modifiedHistoryState, unused, url);
  };

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
