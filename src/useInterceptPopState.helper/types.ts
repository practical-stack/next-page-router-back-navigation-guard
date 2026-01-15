export interface RenderedState {
  historyIndex: number;
  sessionToken: string;
}

export interface NextHistoryState {
  __next_session_token?: string;
  __next_navigation_stack_index?: number;
  [key: string]: unknown;
}
