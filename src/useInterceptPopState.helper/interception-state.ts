/**
 * Interception State Management
 *
 * Tracks the current state of navigation interception flow.
 * Uses closure-based state to avoid React re-renders while maintaining
 * mutable state across async operations.
 */

export interface InterceptionState {
  /**
   * True when URL is being restored via history.go().
   * Used to ignore the popstate event triggered by our own restoration.
   */
  isRestoringUrl: boolean;

  /**
   * True when handler has approved navigation.
   * The next popstate event (triggered by our history.back/go call)
   * should be allowed through without re-running handlers.
   */
  isNavigationConfirmed: boolean;

  /**
   * True when waiting for history.go() to complete before running handler.
   * MDN recommends listening for popstate to know when navigation completes.
   * @see https://developer.mozilla.org/en-US/docs/Web/API/History/go
   */
  pendingHandlerExecution: boolean;

  /**
   * The history index delta stored when back navigation is detected.
   * Used after handler approves to navigate by calling history.go(delta).
   */
  pendingHistoryIndexDelta: number;
}

/**
 * Creates an interception state context with immutable get/set operations.
 * State is stored in closure, not React state, for synchronous access in event handlers.
 */
export function createInterceptionStateContext() {
  let state: InterceptionState = {
    isRestoringUrl: false,
    isNavigationConfirmed: false,
    pendingHandlerExecution: false,
    pendingHistoryIndexDelta: 0,
  };

  return {
    getState: (): InterceptionState => ({ ...state }),

    setState: (updates: Partial<InterceptionState>): void => {
      state = { ...state, ...updates };
    },
  };
}
