export interface PendingNavigation {
  /** 등록된 handler가 탐색을 승인한 뒤 다시 실행할 history delta. */
  delta: number;
}

/**
 * 동기적으로 반환해야 하는 `beforePopState`에서 뒤로가기를 우선 되돌린 뒤, 비동기 handler의 결과를
 * `await`할 수 있도록 다시 실행할 history delta를 pending 상태로 보관한다. 예를 들어 handler가
 * "정말 나가시겠어요?"를 표시하면, 사용자가 "예"를 선택한 뒤 원래 뒤로가기를 다시 실행한다.
 *
 * 일반적으로 URL 복원을 위한 `history.go()`가 발생시킨 popstate에서 Next.js가 `beforePopState`
 * callback을 호출하면 비동기 handler를 시작한다. 그러나 refresh 직후에는 Next.js Router의 `isSsr`가
 * `true`이고 복원된 URL이 현재 route와 같아 initial-load guard가 먼저 반환한다. 이 guard는
 * `beforePopState` callback 호출보다 앞에 있으므로 timing fallback에서도 같은 handler 시작 로직을
 * 실행한다. callback과 fallback이 모두 실행되더라도 같은 pending 값을 `consume`하므로 먼저 실행된
 * 경로만 delta를 얻고, handler도 한 번만 실행된다.
 *
 * @see Next.js 14: https://github.com/vercel/next.js/blob/v14.2.11/packages/next/src/shared/lib/router/router.ts#L973-L986
 * @see Next.js 15: https://github.com/vercel/next.js/blob/v15.5.9/packages/next/src/shared/lib/router/router.ts#L945-L958
 * @see Next.js 16: https://github.com/vercel/next.js/blob/v16.0.10/packages/next/src/shared/lib/router/router.ts#L943-L956
 */
export function createPendingNavigation() {
  let pending: PendingNavigation | null = null;

  return {
    /** handler 승인 후 다시 실행할 history delta를 기록한다. */
    begin: (delta: number): void => {
      pending = { delta };
    },

    hasPending: (): boolean => pending !== null,

    /** pending navigation을 정확히 한 번 반환하고 비운다. */
    consume: (): PendingNavigation | null => {
      const navigation = pending;
      pending = null;
      return navigation;
    },
  };
}
