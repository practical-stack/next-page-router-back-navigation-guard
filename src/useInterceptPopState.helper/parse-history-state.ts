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
 * Mismatch occurs when:
 * - Token is missing (page refresh, external entry, direct URL)
 * - Token doesn't match current session (shouldn't happen in normal flow)
 */
export function hasSessionTokenMismatch(
  nextSessionToken: string | undefined,
  currentSessionToken: string
): boolean {
  return !nextSessionToken || nextSessionToken !== currentSessionToken;
}
