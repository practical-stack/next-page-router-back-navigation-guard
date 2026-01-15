/**
 * Handler Execution
 *
 * Executes registered navigation handlers in priority order.
 * Handlers can be async and return boolean to allow/block navigation.
 *
 * ## once Option Behavior
 *
 * When a handler has `once: true`, it is removed from the handlerMap BEFORE execution.
 * This ensures the handler runs exactly once, regardless of its return value.
 *
 * Key design decision: "once" means "execute once", not "allow navigation once".
 *
 * Example scenario with once: true handler:
 * 1. First back press → handler executes, shows dialog, returns false (blocks)
 *    → handler is already removed from map
 * 2. Second back press → preRegisteredHandler closes dialog
 * 3. Third back press → no handler exists, navigation proceeds
 *
 * If handler was only removed on `return true`, the scenario would be:
 * 1. First back → handler blocks (returns false) → stays registered
 * 2. Second back → preRegisteredHandler closes dialog
 * 3. Third back → handler runs AGAIN (unexpected!)
 *
 * The current implementation prevents this confusion by removing the handler
 * immediately upon execution, before awaiting its result.
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
    // IMPORTANT: Delete BEFORE execution to prevent race conditions with React re-renders.
    // If deleted after execution, a re-render during async callback could re-register
    // the handler before deletion occurs, causing it to run multiple times.
    // See: useRegisterBackNavigationHandler.ts hasExecutedRef for the complementary guard.
    if (firstHandler.once) {
      handlerMap.delete(firstHandler.id);
    }

    const shouldContinue = await firstHandler.callback({ to: destinationPath });

    if (!shouldContinue) {
      if (DEBUG) console.log(`[Handler] Cancelled by handler`);
      return false;
    }
  }

  return true;
}

export function hasRegisteredHandlers(handlerMap: Map<string, HandlerDef>): boolean {
  return handlerMap.size > 0;
}
