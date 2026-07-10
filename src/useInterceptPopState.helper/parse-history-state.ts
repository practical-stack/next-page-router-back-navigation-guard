import type { NextHistoryState } from "./types";

/**
 * history-augmentation이 주입한 tracking metadata를 읽는다. session token이 없거나 현재 렌더링된
 * history entry의 token과 일치하지 않으면 session boundary로 판별할 수 있도록, 누락된 token은
 * `undefined`로 유지한다.
 */
export function parseHistoryState(historyState: NextHistoryState = {}): {
  sessionToken: string | undefined;
  historyIndex: number;
} {
  return {
    sessionToken: historyState.__next_session_token,
    historyIndex: Number(historyState.__next_navigation_stack_index) || 0,
  };
}

/**
 * 다음과 같이 현재 앱 session의 index로 이동 방향을 계산할 수 없는 entry를 session boundary로
 * 간주한다.
 * - 검색 결과에서 앱에 진입한 뒤 다시 검색 결과로 돌아가는 경우: token metadata가 없다.
 * - 마이크로 프론트엔드 환경에서 같은 페이지라도 서로 다른 앱 인스턴스가 라이브러리를 각각
 *   초기화한 entry 사이를 이동하는 경우: 현재와 token이 다르다.
 */
export function isSessionBoundary({
  nextSessionToken,
  currentSessionToken,
}: {
  nextSessionToken: string | undefined;
  currentSessionToken: string;
}): boolean {
  return !nextSessionToken || nextSessionToken !== currentSessionToken;
}
