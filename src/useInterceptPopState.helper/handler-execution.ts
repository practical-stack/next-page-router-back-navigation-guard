/**
 * 핸들러 실행
 *
 * 뒤로가기 실행 시 등록된 핸들러를 우선순위에 따라 실행한다. 핸들러는 비동기일 수 있으며,
 * 뒤로가기 허용 여부를 불리언 값으로 반환한다.
 *
 * `once: true`는 "뒤로가기를 한 번 허용한다"가 아니라 "한 번 실행한다"는 의미다.
 * 따라서 반환값과 관계없이 정확히 한 번만 실행되도록 실행 전에 핸들러를 제거한다.
 * (`true`를 반환했을 때만 제거하면 뒤로가기를 차단한 핸들러가 이후 뒤로가기에서 다시 실행될 수 있다.)
 */

import { HandlerDef } from "../@shared/types";
import { sortHandlersByPriority } from "./sort-handlers";

/**
 * 뒤로가기 핸들러 체인을 실행하고 뒤로가기 허용 여부를 반환한다.
 *
 * 실행 순서:
 * 1. preRegisteredHandler(존재하는 경우) - 우선순위가 가장 높아 먼저 실행한다.
 * 2. 우선순위에 따라 정렬된 handlerMap의 첫 번째 핸들러
 *
 * @param options - 핸들러 정보와 복원된 현재 경로
 * @returns 실행된 모든 핸들러가 뒤로가기를 허용했는지 여부
 */
export async function runHandlerChain({
  handlerMap,
  preRegisteredHandler,
  destinationPath,
}: {
  handlerMap: Map<string, HandlerDef>;
  preRegisteredHandler?: () => boolean;
  destinationPath: string;
}): Promise<boolean> {

  if (preRegisteredHandler) {
    const shouldContinue = preRegisteredHandler();
    if (!shouldContinue) {
      return false;
    }
  }

  const sortedHandlers = sortHandlersByPriority([...handlerMap.values()]);
  const firstHandler = sortedHandlers[0];

  if (firstHandler) {
    // 중요: React 리렌더링과의 경합을 방지하기 위해 실행 전에 삭제한다.
    // 실행 후에 삭제하면 비동기 콜백 도중 발생한 리렌더링이 삭제 전에 핸들러를
    // 다시 등록하여 핸들러가 여러 번 실행될 수 있다.
    // 함께 사용되는 방어 로직은 useRegisterBackNavigationHandler.ts의 hasExecutedRef를 참고한다.
    if (firstHandler.once) {
      handlerMap.delete(firstHandler.id);
    }

    const shouldContinue = await firstHandler.callback({ to: destinationPath });

    if (!shouldContinue) {
      return false;
    }
  }

  return true;
}

export function hasRegisteredHandlers(handlerMap: Map<string, HandlerDef>): boolean {
  return handlerMap.size > 0;
}
