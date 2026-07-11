import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { useContext } from "react";

import type { HandlerDef } from "./@shared/types";
import { useIsomorphicLayoutEffect } from "./@shared/useIsomorphicLayoutEffect";
import { createPopstateInterceptor } from "./useInterceptPopState.helper/popstate-interceptor";

export interface UseInterceptPopStateOptions {
  handlerMap: Map<string, HandlerDef>;
  preRegisteredHandler?: () => boolean;
}

/**
 * Next.js Pages Router의 `beforePopState`에 뒤로가기와 앞으로가기를 처리할 callback을 등록한다.
 *
 * - 사용자가 뒤로가기를 누르면 browser는 callback을 실행하기 전에 이전 history entry로 이동하고
 *   URL과 `history.state`를 먼저 변경한다.
 * - callback은 `false`를 반환해 Next.js가 이전 entry를 렌더링하지 않게 한다.
 * - `false`를 반환해도 URL은 자동으로 돌아오지 않으므로 현재 history entry로 이동해 URL을 복원한다.
 * - URL 복원이 완료되면 등록된 handler를 실행한다.
 * - handler가 승인하면 사용자가 요청한 뒤로가기를 다시 실행한다.
 * - handler가 거부하면 뒤로가기를 실행하지 않고 복원된 현재 페이지에 머무른다.
 * - 앞으로가기는 `true`를 반환해 Next.js가 해당 history entry로 네비게이션하도록 허용한다.
 *
 * @param handlerMap - id별로 등록된 뒤로가기 handler.
 * @param preRegisteredHandler - 등록된 뒤로가기 handler가 없을 때 실행할 선택적 handler. 예를 들어
 *   열려 있는 overlay를 닫고 현재 페이지에 머무르게 할 수 있다.
 */
export function useInterceptPopState({
  handlerMap,
  preRegisteredHandler,
}: UseInterceptPopStateOptions): void {
  const pagesRouter = useContext(RouterContext);

  useIsomorphicLayoutEffect(() => {
    if (!pagesRouter) return;

    const interceptPopstate = createPopstateInterceptor({
      handlerMap,
      preRegisteredHandler,
    });

    pagesRouter.beforePopState(() => interceptPopstate(window.history.state));

    return () => {
      pagesRouter.beforePopState(() => true);
    };
  }, [handlerMap, pagesRouter, preRegisteredHandler]);
}
