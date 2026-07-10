/** history state 관리를 위한 타입 정의. */

/** history stack에서 현재 렌더링된 페이지에 대응하는 history entry metadata를 나타낸다. */
export interface RenderedHistoryEntryMetadata {
  /** history stack에서의 위치(0부터 시작하며 pushState 호출 시 증가) */
  historyIndex: number;
  /** 현재 browser session의 고유 식별자 */
  sessionToken: string;
}

/**
 * custom metadata를 포함한 history.state 구조.
 * Next.js가 자체 property를 추가할 수 있으므로 index signature를 사용한다.
 */
export interface NextHistoryState {
  __next_session_token?: string;
  __next_navigation_stack_index?: number;
  [key: string]: unknown;
}
