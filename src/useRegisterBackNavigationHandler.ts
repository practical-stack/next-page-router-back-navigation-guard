import { useContext, useId, useRef } from "react";
import { BackNavigationHandlerContext } from "./BackNavigationHandlerProvider";
import { HandlerDef } from "./@shared/types";
import { useIsomorphicLayoutEffect } from "./@shared/useIsomorphicLayoutEffect";
import { debug } from "./@shared/debug";

// ============================================================
// Handler Option Types (colocated with useRegisterBackNavigationHandler)
// ============================================================

/**
 * Handler function that returns whether navigation should proceed.
 * Return true to allow navigation, false to block it.
 */
export type BackNavigationHandler = () => boolean;

/**
 * Options for override: true handlers.
 * Override handlers run before non-override handlers and can have priority levels.
 */
export interface BackNavigationHandlerOptionsWithOverride {
  once: boolean;
  enable: boolean;
  override: true;
  /** Priority level 0-3, lower is higher priority (default: 1) */
  overridePriority: 0 | 1 | 2 | 3;
}

/**
 * Options for override: false handlers (default).
 * Only one non-override handler can be registered at a time.
 */
export interface BackNavigationHandlerOptionsWithoutOverride {
  once: boolean;
  enable: boolean;
  override: false;
}

/**
 * Union of all handler option types.
 */
export type BackNavigationHandlerOptions =
  | BackNavigationHandlerOptionsWithOverride
  | BackNavigationHandlerOptionsWithoutOverride;

/**
 * Partial options accepted by useRegisterBackNavigationHandler.
 * All fields are optional with sensible defaults.
 */
export type PartialBackNavigationHandlerOptions = Partial<
  Omit<BackNavigationHandlerOptionsWithOverride, "override"> &
    Omit<BackNavigationHandlerOptionsWithoutOverride, "override"> & {
      override?: boolean;
    }
>;

/**
 * Check for conflicts when registering a new handler.
 * - Two override: false handlers cannot coexist
 * - Two override: true handlers with same priority cannot coexist
 */
function checkConflict(
  newOptions: BackNavigationHandlerOptions,
  handlerMap: Map<string, HandlerDef>
): string | null {
  for (const [, existingDef] of handlerMap.entries()) {
    // Conflict 1: Two non-override handlers
    if (!newOptions.override && !existingDef.override) {
      return `[BackNavigationHandler Conflict] Attempting to register 'override: false' handler, but another non-override handler already exists. Use 'override: true' to register additional handlers.`;
    }

    // Conflict 2: Two override handlers with same priority
    if (
      newOptions.override &&
      existingDef.override &&
      newOptions.overridePriority === existingDef.overridePriority
    ) {
      return `[BackNavigationHandler Conflict] Attempting to register 'override: true' handler with priority ${newOptions.overridePriority}, but another handler with the same priority already exists.`;
    }
  }

  return null;
}

const DEFAULT_OPTIONS = {
  once: false,
  enable: true,
  override: false,
} as const;

/**
 * Register a handler for back/forward navigation (popstate events).
 *
 * @param handler - Function that returns false to prevent navigation, true to allow it
 * @param options - Configuration options for the handler
 * @param options.once - If true, handler executes once then unregisters (default: false)
 * @param options.enable - If false, handler is not registered (default: true)
 * @param options.override - If true, handler has priority over non-override handlers (default: false)
 * @param options.overridePriority - Priority level 0-3, lower is higher priority (default: 1, only when override: true)
 *
 * @example
 * // Basic usage
 * useRegisterBackNavigationHandler(() => {
 *   dialog.open({
 *     title: 'Confirm',
 *     description: 'Are you sure you want to leave?',
 *     onConfirm: () => {
 *       dialog.close();
 *       router.back();
 *     },
 *   });
 *   return false; // Prevent immediate navigation
 * });
 *
 * @example
 * // With options
 * useRegisterBackNavigationHandler(
 *   () => {
 *     console.log('Back pressed once');
 *     return true;
 *   },
 *   { once: true, enable: isFormDirty }
 * );
 *
 * @example
 * // With override priority
 * useRegisterBackNavigationHandler(
 *   () => {
 *     // This handler runs first due to higher priority
 *     return handleCriticalAction();
 *   },
 *   { override: true, overridePriority: 0 }
 * );
 */
export function useRegisterBackNavigationHandler(
  handler: BackNavigationHandler,
  options: PartialBackNavigationHandlerOptions = DEFAULT_OPTIONS
) {
  const callbackId = useId();
  const handlerMap = useContext(BackNavigationHandlerContext);

  // Tracks whether the handler has been executed (for once: true handlers).
  // This ref complements the handlerMap.delete() in handler-execution.ts:
  // - handlerMap.delete() removes the handler from the map immediately
  // - hasExecutedRef prevents re-registration on subsequent React re-renders
  //
  // Why both are needed:
  // 1. handlerMap.delete() alone is not enough because React may re-render
  //    the component (due to state changes in the handler callback),
  //    causing useIsomorphicLayoutEffect to run again and re-register the handler.
  // 2. hasExecutedRef persists across renders and blocks re-registration
  //    when the effect's skip condition checks: (resolvedOptions.once && hasExecutedRef.current)
  const hasExecutedRef = useRef(false);

  if (!handlerMap) {
    throw new Error(
      "useRegisterBackNavigationHandler must be used within a BackNavigationHandlerProvider"
    );
  }

  useIsomorphicLayoutEffect(() => {
    const resolvedOptions: BackNavigationHandlerOptions =
      options.override === true
        ? {
            once: options.once ?? false,
            enable: options.enable ?? true,
            override: true,
            overridePriority: options.overridePriority ?? 1,
          }
        : {
            once: options.once ?? false,
            enable: options.enable ?? true,
            override: false,
          };

    if (!resolvedOptions.enable || (resolvedOptions.once && hasExecutedRef.current)) {
      debug(`Skipping registration for handler: ${callbackId} (enable: ${resolvedOptions.enable}, once: ${resolvedOptions.once}, hasExecuted: ${hasExecutedRef.current})`);
      return;
    }

    const conflictMessage = checkConflict(resolvedOptions, handlerMap);
    if (conflictMessage) {
      console.warn(conflictMessage);
    }

    debug(`Registering back navigation handler: ${callbackId}`, resolvedOptions);

    handlerMap.set(callbackId, {
      id: callbackId,
      callback: async (params) => {
        debug(`Back navigation handler called:`, params);
        // Set BEFORE calling handler to prevent re-registration during handler execution.
        // Handler may trigger state updates → React re-render → effect re-runs.
        // If hasExecutedRef.current is true, the effect's skip condition prevents re-registration.
        hasExecutedRef.current = true;
        return handler();
      },
      override: resolvedOptions.override,
      overridePriority: resolvedOptions.override ? resolvedOptions.overridePriority : 1,
      once: resolvedOptions.once,
    });

    return () => {
      debug(`Unregistering back navigation handler: ${callbackId}`);
      handlerMap.delete(callbackId);
    };
  }, [callbackId, handlerMap, handler, options]);
}
