import { useContext, useId, useRef } from "react";
import { BackNavigationHandlerContext } from "./BackNavigationHandlerProvider";
import { HandlerDef } from "./@shared/types";
import { useIsomorphicLayoutEffect } from "./@shared/useIsomorphicLayoutEffect";

// ============================================================
// Handler option 타입(useRegisterBackNavigationHandler와 같은 파일에 배치)
// ============================================================

/**
 * 탐색 진행 여부를 반환하는 handler 함수.
 * 탐색을 허용하려면 true, 차단하려면 false를 반환한다.
 */
export type BackNavigationHandler = () => boolean;

/**
 * override: true handler를 위한 option.
 * override handler는 non-override handler보다 먼저 실행되며 우선순위를 지정할 수 있다.
 */
export interface BackNavigationHandlerOptionsWithOverride {
  once: boolean;
  enable: boolean;
  override: true;
  /** 우선순위 0-3. 낮을수록 우선순위가 높다(기본값: 1). */
  overridePriority: 0 | 1 | 2 | 3;
}

/**
 * override: false handler를 위한 option(기본값).
 * non-override handler는 한 번에 하나만 등록할 수 있다.
 */
export interface BackNavigationHandlerOptionsWithoutOverride {
  once: boolean;
  enable: boolean;
  override: false;
}

/** 모든 handler option 타입의 union. */
export type BackNavigationHandlerOptions =
  | BackNavigationHandlerOptionsWithOverride
  | BackNavigationHandlerOptionsWithoutOverride;

/**
 * useRegisterBackNavigationHandler가 받는 partial option.
 * 모든 field는 선택 사항이며 적절한 기본값을 사용한다.
 */
export type PartialBackNavigationHandlerOptions = Partial<
  Omit<BackNavigationHandlerOptionsWithOverride, "override"> &
    Omit<BackNavigationHandlerOptionsWithoutOverride, "override"> & {
      override?: boolean;
    }
>;

/**
 * 새 handler를 등록할 때 충돌 여부를 확인한다.
 * - override: false handler 두 개는 함께 존재할 수 없다.
 * - 우선순위가 같은 override: true handler 두 개는 함께 존재할 수 없다.
 */
function checkConflict(
  newOptions: BackNavigationHandlerOptions,
  handlerMap: Map<string, HandlerDef>
): string | null {
  for (const [, existingDef] of handlerMap.entries()) {
    // 충돌 1: non-override handler가 두 개 존재하는 경우
    if (!newOptions.override && !existingDef.override) {
      return `[BackNavigationHandler Conflict] Attempting to register 'override: false' handler, but another non-override handler already exists. Use 'override: true' to register additional handlers.`;
    }

    // 충돌 2: 우선순위가 같은 override handler가 두 개 존재하는 경우
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
 * back/forward 탐색(popstate event)을 위한 handler를 등록한다.
 *
 * @param handler - 탐색을 차단하려면 false, 허용하려면 true를 반환하는 함수
 * @param options - handler 설정 option
 * @param options.once - true이면 handler를 한 번 실행한 뒤 등록 해제한다(기본값: false).
 * @param options.enable - false이면 handler를 등록하지 않는다(기본값: true).
 * @param options.override - true이면 non-override handler보다 우선한다(기본값: false).
 * @param options.overridePriority - 우선순위 0-3. 낮을수록 우선순위가 높다
 *   (기본값: 1, override: true일 때만 사용).
 *
 * @example
 * // 기본 사용법
 * useRegisterBackNavigationHandler(() => {
 *   dialog.open({
 *     title: 'Confirm',
 *     description: 'Are you sure you want to leave?',
 *     onConfirm: () => {
 *       dialog.close();
 *       router.back();
 *     },
 *   });
 *   return false; // 즉시 탐색하는 것을 차단
 * });
 *
 * @example
 * // option과 함께 사용
 * useRegisterBackNavigationHandler(
 *   () => {
 *     console.log('Back pressed once');
 *     return true;
 *   },
 *   { once: true, enable: isFormDirty }
 * );
 *
 * @example
 * // override 우선순위와 함께 사용
 * useRegisterBackNavigationHandler(
 *   () => {
 *     // 우선순위가 더 높으므로 이 handler가 먼저 실행된다.
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

  // handler 실행 여부를 추적한다(once: true handler용).
  // 이 ref는 handler-execution.ts의 handlerMap.delete()와 상호 보완한다.
  // - handlerMap.delete()는 map에서 handler를 즉시 제거한다.
  // - hasExecutedRef는 이후 React 리렌더링에서 다시 등록되는 것을 방지한다.
  //
  // 두 가지가 모두 필요한 이유:
  // 1. handler callback의 state 변경으로 React가 component를 리렌더링할 수 있으므로
  //    handlerMap.delete()만으로는 충분하지 않다. 리렌더링으로 useIsomorphicLayoutEffect가
  //    다시 실행되어 handler를 재등록할 수 있다.
  // 2. hasExecutedRef는 render 사이에도 유지되며 effect의 skip 조건인
  //    (resolvedOptions.once && hasExecutedRef.current)를 통해 재등록을 차단한다.
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
      return;
    }

    const conflictMessage = checkConflict(resolvedOptions, handlerMap);
    if (conflictMessage) {
      console.warn(conflictMessage);
    }

    handlerMap.set(callbackId, {
      id: callbackId,
      callback: async () => {
        // handler 실행 중 재등록을 방지하기 위해 handler를 호출하기 전에 설정한다.
        // handler가 state update를 일으키면 React 리렌더링 후 effect가 다시 실행될 수 있다.
        // hasExecutedRef.current가 true이면 effect의 skip 조건이 재등록을 방지한다.
        hasExecutedRef.current = true;
        return handler();
      },
      override: resolvedOptions.override,
      overridePriority: resolvedOptions.override ? resolvedOptions.overridePriority : 1,
      once: resolvedOptions.once,
    });

    return () => {
      handlerMap.delete(callbackId);
    };
  }, [callbackId, handlerMap, handler, options]);
}
