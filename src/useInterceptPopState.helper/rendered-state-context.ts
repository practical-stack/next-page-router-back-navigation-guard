import type { RenderedState } from "./types";
import {
  generateSessionToken,
  getRenderedState,
  initializeHistoryStateSyncOnce,
} from "./history-augmentation";

export function createRenderedStateContext() {
  const { setRenderedStateAndSyncToHistory } = initializeHistoryStateSyncOnce();

  return {
    getState: (): RenderedState => getRenderedState(),

    setState: (renderedState: RenderedState): void => {
      setRenderedStateAndSyncToHistory({ renderedState, shouldSyncToHistory: false });
    },

    setStateAndSyncToHistory: (renderedState: RenderedState): void => {
      setRenderedStateAndSyncToHistory({ renderedState, shouldSyncToHistory: true });
    },
  };
}

export function computeNextRenderedState(
  nextSessionToken: string | undefined,
  nextHistoryIndex: number
): RenderedState {
  return {
    sessionToken: nextSessionToken || generateSessionToken(),
    historyIndex: nextSessionToken ? nextHistoryIndex : 0,
  };
}

export function computeRenderedStateWithNextHistoryIndex(
  currentRenderedState: RenderedState,
  nextHistoryIndex: number
): RenderedState {
  return { ...currentRenderedState, historyIndex: nextHistoryIndex };
}
