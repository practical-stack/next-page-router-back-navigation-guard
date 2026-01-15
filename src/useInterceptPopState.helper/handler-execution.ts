import { HandlerDef } from "../@shared/types";
import { DEBUG } from "../@shared/debug";
import { sortHandlersByPriority } from "./sort-handlers";

export interface HandlerContext {
  handlerMap: Map<string, HandlerDef>;
  preRegisteredHandler?: () => boolean;
}

export async function runHandlerChainAndGetShouldAllowNavigation(
  context: HandlerContext,
  destinationPath: string
): Promise<boolean> {
  const { handlerMap, preRegisteredHandler } = context;

  if (preRegisteredHandler) {
    const shouldContinue = preRegisteredHandler();
    if (!shouldContinue) {
      if (DEBUG) console.log(`[Handler] Cancelled by preRegisteredHandler`);
      return false;
    }
  }

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

export function hasRegisteredHandlers(handlerMap: Map<string, HandlerDef>): boolean {
  return handlerMap.size > 0;
}
