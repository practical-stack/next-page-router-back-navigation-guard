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
}

/**
 * Creates an interception state context with immutable get/set operations.
 * State is stored in closure, not React state, for synchronous access in event handlers.
 */
export function createInterceptionStateContext() {
  let state: InterceptionState = {
    isRestoringUrl: false,
    isNavigationConfirmed: false,
  };

  return {
    getState: (): InterceptionState => ({ ...state }),

    setState: (updates: Partial<InterceptionState>): void => {
      state = { ...state, ...updates };
    },
  };
}
