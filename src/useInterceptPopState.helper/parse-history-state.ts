export interface ParsedHistoryState {
  nextSessionToken: string | undefined;
  nextHistoryIndex: number;
}

export function parseHistoryState(historyState: any = {}): ParsedHistoryState {
  return {
    nextSessionToken: historyState.__next_session_token,
    nextHistoryIndex: Number(historyState.__next_navigation_stack_index) || 0,
  };
}

export function hasSessionTokenMismatch(
  nextSessionToken: string | undefined,
  currentSessionToken: string
): boolean {
  return !nextSessionToken || nextSessionToken !== currentSessionToken;
}
