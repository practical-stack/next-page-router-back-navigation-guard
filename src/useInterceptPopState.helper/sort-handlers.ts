import { HandlerDef } from "../@shared/types";

/**
 * Sort handlers by priority.
 * Override handlers are executed first, sorted by overridePriority (lower = higher priority).
 * Non-override handlers are executed after override handlers.
 */
export function sortHandlersByPriority(handlers: HandlerDef[]): HandlerDef[] {
  return [...handlers].sort((a, b) => {
    // Override handlers come first
    if (a.override && !b.override) return -1;
    if (!a.override && b.override) return 1;

    // If both have override, sort by overridePriority (lower = higher priority)
    if (a.override && b.override) {
      return a.overridePriority - b.overridePriority;
    }

    // Non-override handlers maintain original order
    return 0;
  });
}
