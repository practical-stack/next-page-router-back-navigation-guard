import type { HandlerDef } from "../@shared/types";
import {
  hasRegisteredHandlers,
  runHandlerChain,
} from "./handler-execution";
import { createInterceptionState } from "./interception-state";
import { parseHistoryState, isSessionBoundary } from "./parse-history-state";
import { createPendingNavigation } from "./pending-navigation";
import {
  createRenderedHistoryEntryMetadataStore,
  createRenderedHistoryEntryMetadata,
  moveRenderedHistoryEntryMetadataToIndex,
} from "./rendered-history-entry-metadata-store";
import type { NextHistoryState, RenderedHistoryEntryMetadata } from "./types";

export interface PopstateInterceptorOptions {
  handlerMap: Map<string, HandlerDef>;
  preRegisteredHandler?: () => boolean;
}

type InterceptPopstate = (historyState?: NextHistoryState) => boolean;

/**
 * `router.beforePopState` callback에서 호출할 popstate 처리 함수를 생성한다. 이 함수와 함수가
 * closure로 관리하는 상태는 `useInterceptPopState` effect가 callback을 등록할 때 만들어지고,
 * effect cleanup에서 callback을 해제할 때까지 유지된다. 현재 화면에 렌더링된 history entry의
 * session token과 history index는 확장된 History API와 공유한다.
 *
 * `history.state`에 기록된 두 값을 기준으로 탐색을 처리한다.
 * - Session token: 이동할 entry가 현재 session에 속하는지 확인한다.
 * - History index: 현재 렌더링된 entry의 index와 비교해 뒤로가기와 앞으로가기를 구분한다.
 *
 * 각 popstate는 다음 세 경로 중 하나로 처리한다.
 * 1. handler의 승인을 받아 다시 실행된 뒤로가기라면 그대로 통과시킨다.
 * 2. session boundary라면 index를 비교할 수 없으므로 한 칸 뒤로 이동한 것으로 보고 `go(1)`로
 *    원래 URL을 복원한다.
 * 3. 현재 session 안에서 앞으로 이동한 경우에는 `true`를 반환해 Next.js가 해당 history entry로
 *    네비게이션하도록 허용한다. 뒤로 이동한 경우에는 handler를 실행하고, handler의 반환값에 따라
 *    뒤로가기를 진행하거나 현재 페이지에 머무른다.
 *
 * `history.go()`는 비동기로 동작하므로, 뒤로가기를 확인하는 과정은 여러 popstate에 걸쳐 진행된다.
 * handler의 확인 결과에 따른 흐름은 다음과 같다.
 *
 * 사용자의 뒤로가기로 발생한 popstate
 *   -> `history.go(restoreDelta)`로 원래 URL 복원
 *   -> URL 복원으로 발생한 popstate에서 `historyIndexDelta === 0` 확인
 *      또는 popstate가 전달되지 않으면 완료 fallback 실행
 *   -> handler 실행
 *      -> 승인: `history.go(backNavigationDelta)`로 원래 뒤로가기 다시 실행
 *         -> 승인된 뒤로가기의 popstate 통과
 *      -> 거부: 뒤로가기를 실행하지 않고 복원된 현재 URL에 머무름
 */
export function createPopstateInterceptor(
  options: PopstateInterceptorOptions
): InterceptPopstate {
  const renderedHistoryEntryMetadataStore = createRenderedHistoryEntryMetadataStore();
  const interceptionState = createInterceptionState();
  const pendingNavigation = createPendingNavigation();

  /** Phase 2: 요청한 URL 복원이 완료되어 이제 guard를 실행할 수 있다. */
  const completeRestoreAndRunHandlers = (): void => {
    const navigation = pendingNavigation.consume();
    if (!navigation) return;

    void (async () => {
      const shouldNavigate = await runHandlerChain({
        handlerMap: options.handlerMap,
        preRegisteredHandler: options.preRegisteredHandler,
        destinationPath: getCurrentPath(),
      });
      if (!shouldNavigate) {
        return;
      }

      interceptionState.confirmNextNavigation();

      // Phase 3: 사용자가 뒤로가기로 이동하려던 URL을 복원한다. 이후 발생하는 popstate는
      // handleConfirmedNavigation이 처리한다.
      window.history.go(navigation.delta);
    })();
  };

  /**
   * Phase 1
   * - 사용자가 요청한 뒤로가기의 delta를 보관한다.
   * - 브라우저가 먼저 이동시킨 URL을 `history.go()`로 현재 URL에 되돌린다.
   * - 뒤로가기를 되돌리는 동안 메모리상의 현재 history index는 변경하지 않는다.
   * - URL 복원 후 도착한 entry와 현재 entry의 index가 같으므로 delta는 0이 된다.
   * - URL 복원으로 발생한 popstate의 `beforePopState` callback에서 delta가 0인지 확인하고 복원 완료를
   *   처리한다.
   * - callback이 호출되지 않으면 명시적으로 예약한 fallback이 대신 처리한다.
   */
  const requestRestoreBeforeRunningHandlers = ({
    restoreDelta,
    backNavigationDelta,
  }: {
    restoreDelta: number;
    backNavigationDelta: number;
  }): false => {
    pendingNavigation.begin(backNavigationDelta);
    window.history.go(restoreDelta);

    scheduleRestoreCompletionFallback(() => {
      if (!pendingNavigation.hasPending()) return;
      completeRestoreAndRunHandlers();
    });
    return false;
  };

  const handleConfirmedNavigation = ({
    nextSessionToken,
    nextHistoryIndex,
  }: {
    nextSessionToken: string | undefined;
    nextHistoryIndex: number;
  }): true => {
    // 도착한 history entry의 history.state에는 session token과 history index가 이미 기록되어
    // 있으므로, 메모리에서 추적하는 현재 entry의 두 값만 갱신한다.
    interceptionState.consumeConfirmation();
    renderedHistoryEntryMetadataStore.set(
      createRenderedHistoryEntryMetadata({
        sessionToken: nextSessionToken,
        historyIndex: nextHistoryIndex,
      })
    );
    return true;
  };

  const handleSessionBoundary = ({
    nextSessionToken,
    nextHistoryIndex,
  }: {
    nextSessionToken: string | undefined;
    nextHistoryIndex: number;
  }): boolean => {
    if (!hasRegisteredHandlers(options.handlerMap)) {
      /**
       * 예를 들어 `once` handler가 실행 후 제거되어 handlerMap은 비었지만 overlay는 아직 열려 있을
       * 수 있다. 이때 사용자가 뒤로가기를 누르면 `preRegisteredHandler`가 overlay를 닫고 `false`를
       * 반환해 뒤로가기를 차단한다. 브라우저는 callback 실행 전에 이미 이전 history entry로
       * 이동했으므로, `go(1)`로 현재 entry의 URL까지 되돌려야 한다. URL을 되돌리지 않으면 Next.js는
       * 현재 페이지를 계속 렌더링하지만 주소창에는 이전 entry의 URL이 표시된다.
       */
      const shouldNavigate = options.preRegisteredHandler?.() ?? true;
      if (!shouldNavigate) {
        window.history.go(1);
        return false;
      }

      renderedHistoryEntryMetadataStore.set(
        createRenderedHistoryEntryMetadata({
          sessionToken: nextSessionToken,
          historyIndex: nextHistoryIndex,
        })
      );
      return true;
    }

    /**
     * Session boundary
     * - 검색 결과처럼 현재 앱 session에 진입하기 전부터 browser history에 있어 session token이 없는
     *   entry로 뒤로가기한 경우다.
     * - 마이크로 프론트엔드 환경에서 다른 앱 인스턴스가 기록해 현재와 다른 session token을 가진
     *   entry로 뒤로가기한 경우도 포함한다.
     * - token이 없거나 다르면 각 session의 history index를 서로 비교할 수 없어 이동 방향과 거리를
     *   계산할 수 없다.
     * - 이 경로는 사용자의 한 칸 뒤로가기로 간주하고 `go(1)`로 현재 history entry와 URL을 복원한다.
     * - handler가 뒤로가기를 승인하면 `go(-1)`로 사용자가 요청한 뒤로가기를 다시 실행한다.
     * - URL 복원으로 발생한 popstate는 현재 entry와 session token 및 history index가 같아 delta 0으로
     *   처리되므로, 현재 session 안에서 발생한 뒤로가기와 같은 pending-navigation 경로를 사용한다.
     */
    return requestRestoreBeforeRunningHandlers({ restoreDelta: 1, backNavigationDelta: -1 });
  };

  const handleBackNavigation = ({
    historyIndexDelta,
    currentRenderedHistoryEntryMetadata,
    nextHistoryIndex,
  }: {
    historyIndexDelta: number;
    currentRenderedHistoryEntryMetadata: RenderedHistoryEntryMetadata;
    nextHistoryIndex: number;
  }): boolean => {
    if (!hasRegisteredHandlers(options.handlerMap)) {
      // 등록된 handler는 없지만 `preRegisteredHandler`가 overlay를 닫으며 `false`를 반환할 수 있다.
      // 이 경우 Next.js는 현재 페이지를 계속 렌더링하므로, 브라우저가 뒤로가기로 먼저 변경한 URL을
      // 현재 history entry의 URL로 되돌린다.
      const shouldNavigate = options.preRegisteredHandler?.() ?? true;
      if (!shouldNavigate) {
        window.history.go(-historyIndexDelta);
        return false;
      }

      renderedHistoryEntryMetadataStore.set(
        moveRenderedHistoryEntryMetadataToIndex({
          currentRenderedHistoryEntryMetadata,
          historyIndex: nextHistoryIndex,
        })
      );
      return true;
    }

    return requestRestoreBeforeRunningHandlers({
      restoreDelta: -historyIndexDelta,
      backNavigationDelta: historyIndexDelta,
    });
  };

  const handleInternalNavigation = ({
    nextHistoryIndex,
    currentRenderedHistoryEntryMetadata,
  }: {
    nextHistoryIndex: number;
    currentRenderedHistoryEntryMetadata: RenderedHistoryEntryMetadata;
  }): boolean => {
    const historyIndexDelta = nextHistoryIndex - currentRenderedHistoryEntryMetadata.historyIndex;

    if (historyIndexDelta === 0) {
      /**
       * zero delta는 URL 복원이 완료되면서 발생한 popstate다. 대기 중인 뒤로가기가 있으면 복원이
       * 완료되었다는 signal이므로 handler를 실행할 수 있다. 대기 중인 뒤로가기가 없으면
       * fallback-only 차단에서 발생한 popstate이므로 그대로 무시해야 한다.
       */
      if (pendingNavigation.hasPending()) {
        completeRestoreAndRunHandlers();
      }
      return false;
    }

    // 이 hook은 뒤로가기만 handler로 확인하며 앞으로가기는 항상 통과시킨다.
    const isForwardNavigation = historyIndexDelta > 0;
    if (isForwardNavigation) {
      renderedHistoryEntryMetadataStore.set(
        moveRenderedHistoryEntryMetadataToIndex({
          currentRenderedHistoryEntryMetadata,
          historyIndex: nextHistoryIndex,
        })
      );
      return true;
    }

    return handleBackNavigation({
      historyIndexDelta,
      currentRenderedHistoryEntryMetadata,
      nextHistoryIndex,
    });
  };

  return (historyState = {}): boolean => {
    const { sessionToken, historyIndex } = parseHistoryState(historyState);
    const currentRenderedHistoryEntryMetadata = renderedHistoryEntryMetadataStore.get();

    if (interceptionState.isNextNavigationConfirmed()) {
      return handleConfirmedNavigation({
        nextSessionToken: sessionToken,
        nextHistoryIndex: historyIndex,
      });
    }

    if (
      isSessionBoundary({
        nextSessionToken: sessionToken,
        currentSessionToken: currentRenderedHistoryEntryMetadata.sessionToken,
      })
    ) {
      return handleSessionBoundary({
        nextSessionToken: sessionToken,
        nextHistoryIndex: historyIndex,
      });
    }

    return handleInternalNavigation({
      nextHistoryIndex: historyIndex,
      currentRenderedHistoryEntryMetadata,
    });
  };
}

function getCurrentPath(): string {
  return window.location.pathname + window.location.search;
}

/**
 * `history.go()`는 비동기이며 popstate가 신뢰할 수 있는 완료 signal이다. 일반적인 복원 경로는
 * 뒤이어 발생하는 zero-delta popstate를 기다린 후 handler를 실행한다.
 *
 * 그러나 refresh 직후에는 Next.js Router의 `isSsr`가 `true`이고 복원된 URL이 현재 route와 같아
 * initial-load guard가 먼저 반환한다. 이 guard는 `beforePopState` callback 호출보다 앞에 있으므로
 * 후속 event가 interceptor에 도달하지 않는다. 다음 paint와 task 이후의 실행은 specification이
 * 보장하는 완료 signal이 아니라 실용적인 fallback이다.
 *
 * 정확성은 정밀한 timing에 의존하지 않는다. 대기 중인 뒤로가기를 원자적으로 consume하므로
 * popstate와 이 fallback 중 먼저 실행된 쪽이 처리하고 다른 쪽은 아무 작업도 하지 않는다.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/History/go
 * @see Next.js 14: https://github.com/vercel/next.js/blob/v14.2.11/packages/next/src/shared/lib/router/router.ts#L973-L986
 * @see Next.js 15: https://github.com/vercel/next.js/blob/v15.5.9/packages/next/src/shared/lib/router/router.ts#L945-L958
 * @see Next.js 16: https://github.com/vercel/next.js/blob/v16.0.10/packages/next/src/shared/lib/router/router.ts#L943-L956
 */
function scheduleRestoreCompletionFallback(callback: () => void): void {
  window.requestAnimationFrame(() => window.setTimeout(callback, 0));
}
