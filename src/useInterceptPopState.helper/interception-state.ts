/**
 * 내부 back 탐색과 session boundary 탐색이 함께 사용하는 확인 flag를 보관한다.
 * handler가 replay를 승인하면, 그 결과로 발생한 다음 popstate는 handler를 다시 실행하지 않고
 * 통과해야 한다.
 *
 * 의도적으로 closure state를 사용한다. `beforePopState`는 동기적으로 접근해야 하며
 * React state update를 기다릴 수 없기 때문이다.
 */
export function createInterceptionState() {
  let isConfirmed = false;

  return {
    isNextNavigationConfirmed: (): boolean => isConfirmed,

    confirmNextNavigation: (): void => {
      isConfirmed = true;
    },

    consumeConfirmation: (): void => {
      isConfirmed = false;
    },
  };
}
