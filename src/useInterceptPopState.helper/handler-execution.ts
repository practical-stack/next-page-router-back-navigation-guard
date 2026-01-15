/**
 * Handler Execution
 *
 * Executes registered navigation handlers in priority order.
 * Handlers can be async and return boolean to allow/block navigation.
 */

import { HandlerDef } from "../@shared/types";
import { DEBUG } from "../@shared/debug";
import { sortHandlersByPriority } from "./sort-handlers";

export interface HandlerContext {
  handlerMap: Map<string, HandlerDef>;
  preRegisteredHandler?: () => boolean;
}

/**
 * Runs the handler chain and returns whether navigation should be allowed.
 *
 * Execution order:
 * 1. preRegisteredHandler (if exists) - highest priority, runs first
 * 2. First handler from sorted handlerMap (sorted by priority)
 *
 * @param context - Handler context containing handlerMap and optional preRegisteredHandler
 * @param destinationPath - The path user is navigating to (empty string for token mismatch case)
 * @returns Promise<boolean> - true to allow navigation, false to block
 */
export async function runHandlerChainAndGetShouldAllowNavigation(
  context: HandlerContext,
  destinationPath: string
): Promise<boolean> {
  const { handlerMap, preRegisteredHandler } = context;

  // Run preRegisteredHandler first (highest priority)
  if (preRegisteredHandler) {
    const shouldContinue = preRegisteredHandler();
    if (!shouldContinue) {
      if (DEBUG) console.log(`[Handler] Cancelled by preRegisteredHandler`);
      return false;
    }
  }

  // Run the first handler by priority (only one handler runs per navigation)
  const sortedHandlers = sortHandlersByPriority([...handlerMap.values()]);
  const firstHandler = sortedHandlers[0];

  if (firstHandler) {
    const shouldContinue = await firstHandler.callback({ to: destinationPath });

    if (firstHandler.once) {
      handlerMap.delete(firstHandler.id);
    }

    if (!shouldContinue) {
      if (DEBUG) console.log(`[Handler] Cancelled by handler`);
      return false;
    }
  }

  return true;
}

/**
 * Checks if there are any registered handlers.
 * Used to skip handler execution logic when no handlers exist.
 */
export function hasRegisteredHandlers(handlerMap: Map<string, HandlerDef>): boolean {
  return handlerMap.size > 0;
}
