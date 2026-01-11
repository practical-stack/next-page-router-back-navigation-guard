import { RenderedState } from "./types";
import { DEBUG } from "../@shared/debug";

/**
 * History API Augmentation Module
 *
 * Handles Index Tracking and Token-based Session Identification.
 * See docs/HISTORY_API_HACKS.md for detailed explanation.
 *
 * Key concepts:
 * - Index: Injected into history.state to track position in history stack
 *   → Used to calculate delta for direction detection (back vs forward)
 * - Token: Session identifier for detecting token mismatch
 *   → Mismatch indicates refresh or external domain entry
 *
 * @module historyAugmentation
 */

let setupDone = false;
let writeState = () => {};

/**
 * Generates a random token to identify the current session.
 * Token mismatch indicates refresh or external domain entry.
 *
 * @returns Random alphanumeric string for session identification
 */
export function newToken() {
  return Math.random().toString(36).substring(2);
}

/**
 * Patches history.pushState and history.replaceState to inject index and token.
 * Must run before Next.js patches these methods (order not guaranteed).
 *
 * @param params.renderedStateRef - Ref object holding current index and token
 * @returns Object containing writeState function to persist state to history
 */
export function setupHistoryAugmentationOnce({
  renderedStateRef,
}: {
  renderedStateRef: { current: RenderedState };
}): { writeState: () => void } {
  if (setupDone) return { writeState };

  if (DEBUG) console.log("setupHistoryAugmentationOnce: setup");

  const originalPushState = window.history.pushState;
  const originalReplaceState = window.history.replaceState;
  if (DEBUG) {
    (window as any).__next_navigation_debug = {
      originalPushState,
      originalReplaceState,
    };
  }

  renderedStateRef.current.index =
    parseInt(window.history.state.__next_navigation_stack_index) || 0;
  renderedStateRef.current.token =
    String(window.history.state.__next_session_token ?? "") ||
    newToken();

  if (DEBUG)
    console.log(
      `setupHistoryAugmentationOnce: initial currentIndex is ${renderedStateRef.current.index}, token is ${renderedStateRef.current.token}`
    );

  writeState = () => {
    if (DEBUG)
      console.log(
        `setupHistoryAugmentationOnce: write state by replaceState(): currentIndex is ${renderedStateRef.current.index}, token is ${renderedStateRef.current.token}`
      );

    const modifiedState = {
      ...window.history.state,
      __next_session_token: renderedStateRef.current.token,
      __next_navigation_stack_index: renderedStateRef.current.index,
    };

    originalReplaceState.call(
      window.history,
      modifiedState,
      "",
      window.location.href
    );
  };

  if (
    window.history.state.__next_navigation_stack_index == null ||
    window.history.state.__next_session_token == null
  ) {
    writeState();
  }

  window.history.pushState = function (state, unused, url) {
    // If current state is not managed by this library, reset the state.
    if (!renderedStateRef.current.token) {
      renderedStateRef.current.token = newToken();
      renderedStateRef.current.index = -1;
    }

    ++renderedStateRef.current.index;

    if (DEBUG)
      console.log(
        `setupHistoryAugmentationOnce: push: currentIndex is ${renderedStateRef.current.index}, token is ${renderedStateRef.current.token}`
      );

    const modifiedState = {
      ...state,
      __next_session_token: renderedStateRef.current.token,
      __next_navigation_stack_index: renderedStateRef.current.index,
    };
    originalPushState.call(this, modifiedState, unused, url);
  };

  window.history.replaceState = function (state, unused, url) {
    // If current state is not managed by this library, reset the state.
    if (!renderedStateRef.current.token) {
      renderedStateRef.current.token = newToken();
      renderedStateRef.current.index = 0;
    }

    if (DEBUG)
      console.log(
        `setupHistoryAugmentationOnce: replace: currentIndex is ${renderedStateRef.current.index}, token is ${renderedStateRef.current.token}`
      );

    const modifiedState = {
      ...state,
      __next_session_token: renderedStateRef.current.token,
      __next_navigation_stack_index: renderedStateRef.current.index,
    };
    originalReplaceState.call(this, modifiedState, unused, url);
  };

  setupDone = true;

  return { writeState };
}
