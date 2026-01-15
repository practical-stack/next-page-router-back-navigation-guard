/**
 * Type definitions for history state management.
 */

/**
 * Represents the state of the currently rendered page in the history stack.
 */
export interface RenderedState {
  /** Position in the history stack (0-based, increments on pushState) */
  historyIndex: number;
  /** Unique identifier for the current browser session */
  sessionToken: string;
}

/**
 * Structure of history.state with our custom metadata.
 * Next.js may add its own properties, so we use index signature.
 */
export interface NextHistoryState {
  __next_session_token?: string;
  __next_navigation_stack_index?: number;
  [key: string]: unknown;
}
