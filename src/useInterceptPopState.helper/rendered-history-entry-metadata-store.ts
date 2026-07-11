import type { RenderedHistoryEntryMetadata } from "./types";
import {
  generateSessionToken,
  getRenderedHistoryEntryMetadata,
  initializeHistoryStateSyncOnce,
  setRenderedHistoryEntryMetadata,
} from "./history-augmentation";

/**
 * 현재 화면에 렌더링된 history entry의 session token과 history index를 메모리에 보관한다.
 *
 * browser는 뒤로가기나 앞으로가기가 발생하면 Next.js의 `beforePopState` callback을 호출하기 전에
 * 활성 history entry와 `history.state`를 먼저 변경한다. 이 시점에는 주소와 `history.state`는 이동할
 * entry를 가리키지만, Next.js 화면은 아직 기존 entry를 렌더링하고 있다. 따라서 `history.state`만
 * 읽어서는 이동 전 화면이 어느 entry였는지 알 수 없다.
 *
 * 메모리에 별도로 보관한 현재 렌더링 entry의 history index와 새 `history.state`의 index를 비교해
 * 뒤로가기와 앞으로가기를 구분하고, 차단한 뒤로가기를 몇 칸 되돌릴지도 계산한다.
 * `beforePopState`는 동기적으로 결과를 반환해야 하므로 React state가 아닌 module-level 값을 사용한다.
 *
 * `set`은 `history.state`를 다시 쓰지 않고, 현재 화면이 나타내는 session token과 history index만
 * 갱신한다. 앞으로가기나 handler가 승인한 뒤로가기로 도착한 entry의 `history.state`에는 두 값이
 * 이미 기록되어 있기 때문이다.
 */
export function createRenderedHistoryEntryMetadataStore() {
  initializeHistoryStateSyncOnce();

  return {
    get: (): RenderedHistoryEntryMetadata => getRenderedHistoryEntryMetadata(),
    set: (nextRenderedHistoryEntryMetadata: RenderedHistoryEntryMetadata): void => {
      setRenderedHistoryEntryMetadata(nextRenderedHistoryEntryMetadata);
    },
  };
}

export function createRenderedHistoryEntryMetadata({
  sessionToken,
  historyIndex,
}: {
  sessionToken: string | undefined;
  historyIndex: number;
}): RenderedHistoryEntryMetadata {
  // token이 없는 history entry는 현재 session의 index와 비교할 수 없으므로 새 session을 시작한다.
  if (!sessionToken) {
    return { sessionToken: generateSessionToken(), historyIndex: 0 };
  }

  return { sessionToken, historyIndex };
}

export function moveRenderedHistoryEntryMetadataToIndex({
  currentRenderedHistoryEntryMetadata,
  historyIndex,
}: {
  currentRenderedHistoryEntryMetadata: RenderedHistoryEntryMetadata;
  historyIndex: number;
}): RenderedHistoryEntryMetadata {
  return { ...currentRenderedHistoryEntryMetadata, historyIndex };
}
