/**
 * History State Parsing
 *
 * Utilities for parsing and validating history.state metadata
 * injected by the history augmentation module.
 */

import type { NextHistoryState } from "./types";

export interface ParsedHistoryState {
  nextSessionToken: string | undefined;
  nextHistoryIndex: number;
}

/**
 * Parses custom metadata from history.state.
 * Returns undefined token if not present (indicates refresh or external entry).
 */
export function parseHistoryState(historyState: NextHistoryState = {}): ParsedHistoryState {
  return {
    nextSessionToken: historyState.__next_session_token,
    nextHistoryIndex: Number(historyState.__next_navigation_stack_index) || 0,
  };
}

/**
 * Checks if there's a session token mismatch.
 *
 * After a page refresh, mismatch ALWAYS occurs: Next.js Pages Router overwrites
 * `history.state` before this library initializes, so the previous session's
 * token cannot be restored. initializeHistoryStateSyncOnce() always starts with
 * a fresh token, and older history entries still carry the previous session's
 * token — so every popstate after refresh lands here.
 *
 * Mismatch occurs when:
 * - Token is missing (first visit, older entry without our metadata)
 * - Token doesn't match current session (always the case after refresh)
 */
export function hasSessionTokenMismatch(
  nextSessionToken: string | undefined,
  currentSessionToken: string
): boolean {
  return !nextSessionToken || nextSessionToken !== currentSessionToken;
}
