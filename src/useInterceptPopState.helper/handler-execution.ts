/**
 * Handler Execution
 *
 * Executes registered navigation handlers in priority order. Handlers may be async and
 * return a boolean to allow/block navigation.
 *
 * `once: true` means "execute once", not "allow navigation once": the handler is removed
 * BEFORE execution, so it runs exactly once regardless of its return value. (Removing it
 * only on `return true` would let a blocking handler re-run on a later back press.)
 */

import { HandlerDef } from "../@shared/types";
import { debug } from "../@shared/debug";
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
      debug(`[Handler] Cancelled by preRegisteredHandler`);
      return false;
    }
  }

  // Run the first handler by priority (only one handler runs per navigation)
  const sortedHandlers = sortHandlersByPriority([...handlerMap.values()]);
  const firstHandler = sortedHandlers[0];

  if (firstHandler) {
    // IMPORTANT: Delete BEFORE execution to prevent race conditions with React re-renders.
    // If deleted after execution, a re-render during async callback could re-register
    // the handler before deletion occurs, causing it to run multiple times.
    // See: useRegisterBackNavigationHandler.ts hasExecutedRef for the complementary guard.
    if (firstHandler.once) {
      handlerMap.delete(firstHandler.id);
    }

    const shouldContinue = await firstHandler.callback({ to: destinationPath });

    if (!shouldContinue) {
      debug(`[Handler] Cancelled by handler`);
      return false;
    }
  }

  return true;
}

export function hasRegisteredHandlers(handlerMap: Map<string, HandlerDef>): boolean {
  return handlerMap.size > 0;
}
