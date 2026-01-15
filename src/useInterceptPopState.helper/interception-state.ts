export interface InterceptionState {
  isRestoringUrl: boolean;
  isNavigationConfirmed: boolean;
}

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
