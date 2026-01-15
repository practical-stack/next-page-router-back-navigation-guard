/**
 * Rendered State Context
 *
 * Provides a context wrapper around the rendered state with immutable operations.
 * "Rendered state" refers to the history index and session token that corresponds
 * to the currently rendered page.
 */

import type { RenderedState } from "./types";
import {
  generateSessionToken,
  getRenderedState,
  initializeHistoryStateSyncOnce,
} from "./history-augmentation";

/**
 * Creates a rendered state context with get/set operations.
 * Internally initializes history state sync (singleton) on first call.
 */
export function createRenderedStateContext() {
  const { setRenderedStateAndSyncToHistory } = initializeHistoryStateSyncOnce();

  return {
    getState: (): RenderedState => getRenderedState(),

    /**
     * Updates rendered state without syncing to history.state.
     * Used for forward navigation where history.state is already correct.
     */
    setState: (renderedState: RenderedState): void => {
      setRenderedStateAndSyncToHistory({ renderedState, shouldSyncToHistory: false });
    },

    /**
     * Updates rendered state AND syncs to history.state via replaceState.
     * Used after navigation is confirmed to ensure history.state matches our state.
     */
    setStateAndSyncToHistory: (renderedState: RenderedState): void => {
      setRenderedStateAndSyncToHistory({ renderedState, shouldSyncToHistory: true });
    },
  };
}

/**
 * Computes the next rendered state from navigation parameters.
 *
 * If session token exists in history.state, use it with the new index.
 * If no token (refresh/external entry), generate new token and reset index to 0.
 */
export function computeNextRenderedState(
  nextSessionToken: string | undefined,
  nextHistoryIndex: number
): RenderedState {
  return {
    sessionToken: nextSessionToken || generateSessionToken(),
    historyIndex: nextSessionToken ? nextHistoryIndex : 0,
  };
}

/**
 * Creates a new rendered state with updated history index.
 * Preserves the session token from current state.
 */
export function computeRenderedStateWithNextHistoryIndex(
  currentRenderedState: RenderedState,
  nextHistoryIndex: number
): RenderedState {
  return { ...currentRenderedState, historyIndex: nextHistoryIndex };
}
