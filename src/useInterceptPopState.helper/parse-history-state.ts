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
 * Returns undefined token if not present (indicates a missing/older entry without our metadata).
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
 * After a page refresh the previous token is restored at module-evaluation time
 * (history-augmentation.ts reads history.state before Next.js router hydration
 * overwrites it), so a normal refresh no longer triggers a mismatch.
 *
 * Mismatch indicates a genuine session boundary:
 * - Token is missing (first visit, older entry without our metadata)
 * - Token doesn't match current session (genuine session boundary, e.g. cross-session entry)
 */
export function hasSessionTokenMismatch(
  nextSessionToken: string | undefined,
  currentSessionToken: string
): boolean {
  return !nextSessionToken || nextSessionToken !== currentSessionToken;
}
