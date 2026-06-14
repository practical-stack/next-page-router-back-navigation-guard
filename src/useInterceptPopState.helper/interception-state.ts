/**
 * Interception State Management
 *
 * Holds isNavigationConfirmed — the *shared* flag used by BOTH the normal-back and the
 * session-boundary paths: it says the next self-induced popstate (the one our
 * history.back()/go() is about to trigger) should be allowed through without re-running
 * handlers. The other interception concern lives in its own module because it is scoped to
 * a single path:
 * - pending-handler-restore.ts — the normal-back deferred restore.
 *
 * Uses closure-based state, not React state, for synchronous access inside event handlers.
 */

export interface InterceptionState {
  /**
   * True when a handler has approved navigation.
   * The next popstate event (triggered by our history.back/go call)
   * should be allowed through without re-running handlers.
   */
  isNavigationConfirmed: boolean;
}

export function createInterceptionStateContext() {
  let state: InterceptionState = {
    isNavigationConfirmed: false,
  };

  return {
    getState: (): InterceptionState => ({ ...state }),

    setState: (updates: Partial<InterceptionState>): void => {
      state = { ...state, ...updates };
    },
  };
}
