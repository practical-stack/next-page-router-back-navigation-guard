/**
 * History API 확장
 *
 * History API는 stack index를 노출하지 않으므로 한 번의 history 이동에서 몇 개의
 * history entry를 건너갔는지와 이동 방향이 back인지 forward인지 기본 기능만으로는 알 수 없다.
 * (Navigation API에는 `navigation.currentEntry.index`가 있지만 Safari/Firefox는 지원하지 않는다.)
 *
 * 해결 방법: `history.pushState` / `history.replaceState`를 monkey-patch하여 자체 metadata를
 * `history.state`에 주입한다.
 * - `__next_navigation_stack_index` — stack 내 위치(delta로 back과 forward를 구분)
 * - `__next_session_token` — session 식별자(refresh / 외부 history entry 감지)
 *
 * @see 자세한 설명은 docs/01-why-this-library.md 참고
 */

import type { RenderedHistoryEntryMetadata } from "./types";

const SESSION_TOKEN_KEY = "__next_session_token";
const STACK_INDEX_KEY = "__next_navigation_stack_index";

/**
 * 이전 session에서 우리가 기록한 metadata를 MODULE-EVALUATION 시점에 저장한다.
 *
 * browser는 reload 후 대략 `load` event까지 history entry의 history.state를 보존한다.
 * Next.js Pages Router는 조금 뒤의 router hydration(provider가 mount되는 시점)에 이를
 * 덮어쓴다. 이 과정에서 우리가 기록한 session token과 stack index metadata가 사라지므로,
 * provider mount 시점에 `history.state`를 읽으면 Next.js가 덮어쓴 state만 보인다.
 * Module evaluation은 hydration보다 먼저 실행되므로 이 시점에는 우리가 기록한
 * session token과 stack index metadata가 모두 남아 있다.
 *
 * 이를 복구하면 refresh된 history entry가 원래 session에 다시 합류하므로, refresh 이후의 모든
 * popstate를 boundary로 취급하지 않고 index를 통해 back/forward를 구분할 수 있다.
 */
const _capturedRenderedHistoryEntryMetadataAtModuleLoad: RenderedHistoryEntryMetadata | null =
  typeof window !== "undefined" &&
  window.history &&
  window.history.state &&
  window.history.state[SESSION_TOKEN_KEY]
    ? {
        sessionToken: window.history.state[SESSION_TOKEN_KEY],
        historyIndex: Number(window.history.state[STACK_INDEX_KEY]) || 0,
      }
    : null;

// 모듈 수준의 singleton state
let _isHistoryStateSyncInitialized = false;
let _renderedHistoryEntryMetadata: RenderedHistoryEntryMetadata = {
  historyIndex: -1,
  sessionToken: "",
};

/**
 * 새로운 session을 위한 무작위 session token을 생성한다.
 *
 * 복구할 이전 session이 없는 실제 최초 방문이나 token이 생기기 전에 실행된
 * pushState/replaceState에서만 사용한다. refresh 후에는 이전 token을 module evaluation
 * 시점에 복원한다(_capturedRenderedHistoryEntryMetadataAtModuleLoad 참고).
 */
export function generateSessionToken(): string {
  return Math.random().toString(36).substring(2);
}

/**
 * 현재 rendered history entry metadata의 immutable copy를 반환한다.
 */
export function getRenderedHistoryEntryMetadata(): RenderedHistoryEntryMetadata {
  return { ..._renderedHistoryEntryMetadata };
}

/**
 * module-level rendered history entry metadata를 immutable 방식으로 갱신한다.
 */
function setRenderedHistoryEntryMetadata(
  nextRenderedHistoryEntryMetadata: RenderedHistoryEntryMetadata
): void {
  _renderedHistoryEntryMetadata = { ...nextRenderedHistoryEntryMetadata };
}

/**
 * 자체 tracking metadata를 history.state object에 병합한다.
 * primitive state 값에는 metadata를 추가할 수 없으므로 object로 대체한다.
 */
function withTrackingMetadata({
  historyState,
  renderedHistoryEntryMetadata,
}: {
  historyState: unknown;
  renderedHistoryEntryMetadata: RenderedHistoryEntryMetadata;
}) {
  const { sessionToken, historyIndex } = renderedHistoryEntryMetadata;
  const existingState = isRecord(historyState) ? historyState : {};

  return {
    ...existingState,
    [SESSION_TOKEN_KEY]: sessionToken,
    [STACK_INDEX_KEY]: historyIndex,
  };
}

/**
 * 자체 rendered history entry metadata를 동기화하고 모든 history entry에 tracking metadata를
 * 기록하도록 history.pushState / history.replaceState의 대체 함수를 만든다.
 *
 * pushState는 index를 1 증가시키고 replaceState는 유지한다. 아직 session이 없으면
 * 두 함수 모두 새 session을 시작한다.
 */
function createPatchedHistoryMethod({
  original,
  methodKind,
}: {
  original: History["pushState"];
  methodKind: "pushState" | "replaceState";
}): History["pushState"] {
  return function (this: History, historyState, unused, url) {
    const currentRenderedHistoryEntryMetadata = getRenderedHistoryEntryMetadata();
    const indexIncrement = methodKind === "pushState" ? 1 : 0;
    const nextRenderedHistoryEntryMetadata: RenderedHistoryEntryMetadata =
      currentRenderedHistoryEntryMetadata.sessionToken
        ? {
            sessionToken: currentRenderedHistoryEntryMetadata.sessionToken,
            historyIndex:
              currentRenderedHistoryEntryMetadata.historyIndex + indexIncrement,
          }
        : { sessionToken: generateSessionToken(), historyIndex: 0 };

    original.call(
      this,
      withTrackingMetadata({
        historyState,
        renderedHistoryEntryMetadata: nextRenderedHistoryEntryMetadata,
      }),
      unused,
      url
    );
    setRenderedHistoryEntryMetadata(nextRenderedHistoryEntryMetadata);
  };
}

/**
 * 원본 replaceState를 사용하여 현재 history entry에 rendered history entry metadata를 기록한다.
 */
function syncRenderedHistoryEntryMetadataToCurrentEntry({
  originalReplaceState,
  nextRenderedHistoryEntryMetadata,
}: {
  originalReplaceState: History["replaceState"];
  nextRenderedHistoryEntryMetadata: RenderedHistoryEntryMetadata;
}): void {
  originalReplaceState.call(
    window.history,
    withTrackingMetadata({
      historyState: window.history.state,
      renderedHistoryEntryMetadata: nextRenderedHistoryEntryMetadata,
    }),
    "",
    window.location.href
  );
}

/**
 * history state 동기화를 초기화한다(singleton — 한 번만 실행).
 *
 * module evaluation 시점에 저장한 이전 session이 있으면 복구하고, 없으면 새 session을
 * 시작한다. 현재 history entry에 metadata를 기록하고 이후 모든 history entry에도 기록되도록
 * pushState/replaceState를 patch한다.
 *
 * metadata는 각 history entry의 `history.state`와 module-level 변수에 함께 저장한다.
 * `history.state`는 entry별 session token과 index를 보존하여 popstate로 도착한 entry를
 * 식별하고, reload 후에도 해당 값을 복구할 수 있게 한다.
 *
 * 두 저장소가 필요한 이유는 popstate callback이 실행될 때 browser는 이미 이동을 완료하여
 * `window.history.state`가 도착한 entry를 가리키지만, Next.js는 guard의 반환값을 확인하기 전이라
 * 기존 entry의 화면을 렌더링하고 있기 때문이다. 따라서 module-level 변수에 현재 렌더링 중인
 * entry의 metadata를 별도로 유지하고, 이를 도착한 entry의 `history.state`와 비교하여 이동 방향과
 * 거리를 계산한다.
 *
 * @returns popstate로 다른 entry가 렌더링된 후, module-level metadata를 해당 entry의
 * `history.state`에 이미 저장된 값으로 갱신하는 setter
 */
export function initializeHistoryStateSyncOnce(): {
  setRenderedHistoryEntryMetadata: (
    renderedHistoryEntryMetadata: RenderedHistoryEntryMetadata
  ) => void;
} {
  if (_isHistoryStateSyncInitialized) {
    return { setRenderedHistoryEntryMetadata };
  }

  // patch하기 전에 원본 method를 저장한다.
  const originalHistoryPushState = window.history.pushState;
  const originalHistoryReplaceState = window.history.replaceState;

  // 저장된 session을 복구하거나(refresh), 새로운 session을 시작한다(실제 최초 방문).
  if (_capturedRenderedHistoryEntryMetadataAtModuleLoad) {
    setRenderedHistoryEntryMetadata(_capturedRenderedHistoryEntryMetadataAtModuleLoad);
  } else {
    setRenderedHistoryEntryMetadata({
      historyIndex: 0,
      sessionToken: generateSessionToken(),
    });
  }
  /**
   * 현재 history entry에 metadata를 초기 기록한다. patch된 push/replace는 patch 이후 생성된
   * history entry에만 기록하므로 사용자가 이미 머물고 있는 history entry에는 metadata가 없다.
   * refresh 후에는 복원된 session을 다시 기록한다. 그러지 않으면 복구한 token은 메모리에만 있고
   * 저장된 history entry에는 여전히 token이 없다. 최초 방문이라면 새로운
   * { index: 0, token }을 기록한다.
   * Next.js는 초기화 중 metadata를 지우므로 이 guard는 사실상 항상 true지만, 이미 metadata가
   * 있을 수 있는 non-Next 환경을 위해 유지한다. `== null`은 null과 undefined를 모두 확인한다
   * (존재하지 않는 key를 읽으면 undefined가 반환된다).
   */
  if (
    !window.history.state ||
    window.history.state[STACK_INDEX_KEY] == null ||
    window.history.state[SESSION_TOKEN_KEY] == null
  ) {
    syncRenderedHistoryEntryMetadataToCurrentEntry({
      originalReplaceState: originalHistoryReplaceState,
      nextRenderedHistoryEntryMetadata: getRenderedHistoryEntryMetadata(),
    });
  }

  window.history.pushState = createPatchedHistoryMethod({
    original: originalHistoryPushState,
    methodKind: "pushState",
  });
  window.history.replaceState = createPatchedHistoryMethod({
    original: originalHistoryReplaceState,
    methodKind: "replaceState",
  });

  _isHistoryStateSyncInitialized = true;

  return { setRenderedHistoryEntryMetadata };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
