# 이 라이브러리가 필요한 이유

브라우저 History API와 Next.js Pages Router의 한계, 그리고 이 라이브러리가 해결하는 문제를 설명합니다.

---

## 목차

1. [뒤로가기 제어가 필요한 상황](#뒤로가기-제어가-필요한-상황)
2. [Next.js Pages Router 내부 동작](#nextjs-pages-router-내부-동작)
3. [Next.js가 해결하지 않는 문제](#nextjs가-해결하지-않는-문제)
4. [문제 1: URL 복원](#문제-1-url-복원)
5. [문제 2: 뒤로가기 vs 앞으로가기 구분](#문제-2-뒤로가기-vs-앞으로가기-구분)
6. [문제 3: 새로고침과 세션 토큰 복구](#문제-3-새로고침과-세션-토큰-복구)
7. [정리](#정리)

---

## 뒤로가기 제어가 필요한 상황

브라우저 뒤로가기 버튼이 항상 "이전 페이지로 이동"을 의미하지는 않습니다.

### Case 1: 모달 닫기

모달이 열려 있을 때, 사용자는 뒤로가기로 모달을 닫으려 합니다. 특히 모바일에서.

```
모달 열림 → 뒤로가기 → 기대: 모달 닫힘
                       현실: 페이지 이동!
```

### Case 2: 미저장 데이터 보호

폼에 저장하지 않은 데이터가 있을 때:

```
폼 작성 중 → 뒤로가기 → 기대: "변경사항이 있습니다" 확인
                        현실: 데이터 유실!
```

### Case 3: 멀티스텝 Wizard

결제, 온보딩 같은 단계별 flow:

```
3단계 → 뒤로가기 → 기대: 2단계로 이동
                   현실: wizard 이탈!
```

### 공통점

모든 케이스에서 뒤로가기를 **가로채서** 다음 중 하나를 수행해야 합니다:
- 이동 차단
- 커스텀 동작 (모달 닫기, confirm dialog)
- 이동 허용

**Next.js에서는 어떻게 해야 할까요?**

---

## Next.js Pages Router 내부 동작

Next.js 소스 코드를 직접 분석해봅니다.

> Source: [`packages/next/src/shared/lib/router/router.ts`](https://github.com/vercel/next.js/blob/canary/packages/next/src/shared/lib/router/router.ts)

### Step 1: Router 초기화

Router 생성자에서 `popstate` 이벤트 리스너를 등록합니다:

```typescript
// packages/next/src/shared/lib/router/router.ts
constructor(...) {
  // ...
  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', this.onPopState)
  }
}
```

브라우저 뒤로가기/앞으로가기를 감지하는 방법입니다.

### Step 2: onPopState Handler

뒤로가기/앞으로가기 시 `onPopState`가 호출됩니다:

```typescript
// packages/next/src/shared/lib/router/router.ts (simplified)
onPopState = (e: PopStateEvent): void => {
  const state = e.state as HistoryState

  // Edge cases
  if (!state) {
    // hash 변경 또는 구버전 브라우저 (Safari < 8, Chrome < 34)
    this.changeState('replaceState', ...)
    return
  }
  if (state.__NA) {
    // App Router - full reload
    window.location.reload()
    return
  }
  if (!state.__N) {
    // Next.js가 관리하는 state가 아님
    return
  }

  // Safari는 브라우저 재시작 시 popstate 발생 - skip
  if (isFirstPopStateEvent && this.locale === state.options.locale && 
      state.as === this.asPath) {
    return
  }

  // ★ 핵심 ★
  // _bps: router.beforePopState()로 등록한 callback
  // false 반환 시 그냥 return
  if (this._bps && !this._bps(state)) {
    return  // ← 여기서 끝. URL은 이미 변경된 상태!
  }

  // 정상 케이스: route 변경 진행
  this.change('replaceState', url, as, options, forcedScroll)
}
```

### Step 3: beforePopState API

`router.beforePopState()`는 callback을 `this._bps`에 저장합니다:

```typescript
router.beforePopState(({ url, as, options }) => {
  if (hasUnsavedChanges) {
    return false  // 차단
  }
  return true
})
```

`false` 반환 시 handler에서 일어나는 일:

```typescript
if (this._bps && !this._bps(state)) {
  return  // ← 이게 전부
}
```

Next.js는 **handler를 종료**할 뿐, 다음은 하지 않습니다:
- URL 복원
- event 발생
- state 업데이트
- `history.go()` 호출

소스 코드 주석:
> *"If the downstream application returns falsy, return. They will then be responsible for handling the event."*

### Timeline: URL 불일치 발생 과정

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. 뒤로가기 클릭                                                 │
│    URL: /page-b → /page-a  (브라우저가 즉시 변경)                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. popstate event 발생                                          │
│    e.state = { __N: true, url: '/page-a', as: '/page-a', ... }  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Next.js onPopState 실행                                      │
│    if (this._bps && !this._bps(state)) { return }               │
│                                                                 │
│    callback이 false 반환 → handler 종료                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. 결과                                                         │
│    - URL bar: /page-a  ← 변경됨                                 │
│    - React: /page-b    ← 그대로                                 │
│    - 화면: /page-b 내용 + /page-a URL                           │
└─────────────────────────────────────────────────────────────────┘
```

**핵심**: 브라우저는 JavaScript 실행 *전에* URL을 변경합니다. `beforePopState` 호출 시점에는 이미 URL이 바뀌어 있습니다. Next.js는 내부 state 업데이트만 취소할 뿐, URL 복원은 개발자 몫입니다.

---

## Next.js가 해결하지 않는 문제

| 필요한 기능 | Next.js 제공 여부 |
|------------|------------------|
| 뒤로가기 차단 | `beforePopState(() => false)` ✅ |
| URL 복원 | ❌ |
| 뒤로가기 vs 앞으로가기 구분 | ❌ |
| 새로고침 처리 | ❌ |
| 외부 도메인 진입 처리 | ❌ |

공식 문서: *"you'll be responsible for handling it"* — 하지만 방법은 설명 없음.

이 라이브러리가 그 gap을 채웁니다.

---

## 문제 1: URL 복원

### 뒤로가기 시 발생하는 일

```
User clicks back button
        │
        ▼
┌─────────────────────────────────────┐
│ 1. Browser changes URL immediately  │
│    /posts/123 → /posts              │
│    (This happens BEFORE any JS!)    │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│ 2. Browser fires popstate event     │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│ 3. Next.js Router catches event     │
│    Calls beforePopState callback    │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│ 4. If callback returns false:       │
│    Next.js state update cancelled   │
│    BUT URL is already changed!      │
└─────────────────────────────────────┘
```

### 핵심 문제

`beforePopState`에서 `false`를 반환해도:

| 상태 | 값 |
|------|-----|
| URL bar | `/posts` (변경됨!) |
| React state | `/posts/123` |
| 결과 | **URL ≠ React state** |

**원인**: 브라우저는 JS 실행 전에 URL을 변경합니다.

### 해결책: history.go()로 URL 복원

**Token mismatch (진짜 세션 경계 — 외부 진입, 메타데이터 없음):**
```typescript
window.history.go(1);  // 항상 1칸 forward
```

**Internal navigation (새로고침 후 일반 뒤로가기 포함):**
```typescript
const delta = nextIndex - currentIndex;  // e.g., -1, -2, -3
window.history.go(-delta);  // delta만큼 복원
```

왜 다른 방식인가?
- Token mismatch: 진짜 세션 경계 — 항상 정확히 1칸 뒤로 온 상황
- Internal: 히스토리 드롭다운으로 여러 칸 점프 가능; 새로고침 후에는 새로고침된 entry가 원래 세션에 복귀하므로 index 기반 계산이 여기서도 적용됨

---

## 문제 2: 뒤로가기 vs 앞으로가기 구분

### 방향 구분이 필요한 이유

`popstate`는 **뒤로가기/앞으로가기 모두**에서 발생합니다. 우리는 **뒤로가기만** 차단하고 싶습니다.

| Navigation | Block? |
|------------|--------|
| Back | Yes |
| Forward | No |

방향 구분을 위해서는 history stack에서의 **현재 위치(index)**가 필요합니다:

```
History Stack:
[0] /
[1] /posts
[2] /posts/123  ← current (index: 2)

Back: nextIndex (1) < currentIndex (2) → Block
Forward: nextIndex (3) > currentIndex (2) → Allow
```

### Navigation API는 지원이 부족

```typescript
navigation.currentEntry.index  // 현재 index
```

| Browser | Navigation API |
|---------|----------------|
| Chrome | ✅ (102+) |
| Edge | ✅ (102+) |
| Safari | ✅ (26.4+) |
| Firefox | ✅ (149+) |

글로벌 지원율은 ~87.8% ([caniuse](https://caniuse.com/mdn-api_navigation))지만, Safari·Firefox는 최근 버전에서야 지원이 추가됐기 때문에 구버전 사용자 비율이 여전히 큽니다. 모든 브라우저에서 동작하는 fallback이 필요합니다.

### 해결책: history.pushState를 patch해서 index 주입

```typescript
window.history.pushState = function (state, unused, url) {
  ++renderedStateRef.current.index;

  const modifiedState = {
    ...state,
    __next_navigation_stack_index: renderedStateRef.current.index,
  };

  originalPushState.call(this, modifiedState, unused, url);
};
```

popstate에서 delta 계산:

```typescript
const nextIndex = Number(nextState.__next_navigation_stack_index) || 0;
const delta = nextIndex - renderedStateRef.current.index;

if (delta < 0) {
  // Back → Block
} else {
  // Forward → Allow
}
```

세션 토큰이 이제 새로고침 후 모듈 평가 시점에 복구되기 때문에 (문제 3 참조), 새로고침된 entry는 원래 세션으로 복귀하고, 이 동일한 index 기반 delta 계산이 새로고침 후에도 앞으로가기와 뒤로가기를 올바르게 구분합니다.

---

## 문제 3: 새로고침과 세션 토큰 복구

### 새로고침 후 토큰을 복구하는 방법

새로고침 후에는 라이브러리가 모듈 평가 시점 — 번들 실행 중, Next.js 라우터 하이드레이션이 `history.state`를 덮어쓰기 전 — 에 `history.state`를 읽어 이전 세션 토큰을 복구합니다. (브라우저는 `load` 이벤트 직전까지 현재 entry의 `history.state`를 새로고침에 걸쳐 보존합니다. Next.js는 하이드레이션 중 — Provider가 마운트되는 시점 — 에야 비로소 덮어씁니다. 따라서 Provider 마운트 시점에 읽으면 너무 늦지만, 모듈 평가 시점에 읽으면 이전 토큰을 볼 수 있습니다.) 새로고침된 entry가 원래 세션으로 복귀하기 때문에, 새로고침 후 navigation도 index로 추적됩니다: 앞으로가기는 앞으로가기(delta > 0, 허용), 뒤로가기는 뒤로가기(delta < 0, 가드됨)로 올바르게 감지됩니다.

이는 `history-augmentation.ts`에서 구현됩니다: `__next_session_token`과 `__next_navigation_stack_index`가 모듈 평가 시점에 `history.state`에서 읽히고, `initializeHistoryStateSyncOnce()`는 값이 캡처된 경우 `{token, index}`를 복원하고, 그렇지 않으면 진짜 새 세션을 위한 새 토큰을 생성합니다.

### 새로고침 후 뒤로가기를 위한 rAF + setTimeout 폴백

새로고침 후에는 Next.js가 라이브러리의 synthetic `history.go()` 복원에 대해 `beforePopState`를 호출하지 않으므로, 정상적인 `delta === 0` 후속 popstate가 도착하지 않습니다. 따라서 internal-back 경로는 `requestAnimationFrame` + `setTimeout` 폴백도 예약해서 핸들러가 반드시 실행되도록 하며, 정확히 한 번만 실행되도록 플래그로 보호됩니다.

### 해결책: Token 기반 세션 경계 식별 (진짜 경계에만 적용)

Token 주입은 여전히 index와 함께 이루어집니다:

```typescript
const modifiedState = {
  ...state,
  __next_navigation_stack_index: renderedStateRef.current.index,
  __next_session_token: renderedStateRef.current.token,
};
```

popstate에서 token-mismatch 검사는 이제 진짜 세션 경계 — 메타데이터가 없거나 다른 세션의 토큰을 가진 entry — 만 처리합니다:

```typescript
const token = nextState.__next_session_token;

const isTokenMismatch =
  !token ||  // 세션 메타데이터 없음 (첫 방문, 라이브러리 도입 전 entry)
  token !== renderedStateRef.current.token;  // 진짜 다른 세션
```

token-mismatch 경로는 여전히 존재하지만, 더 이상 일반적인 새로고침 후 경로가 아닙니다. 이제는 진짜 세션 경계 — 메타데이터가 없거나 다른 세션의 토큰을 가진 entry — 만 처리합니다.

### 시나리오 예시

**새로고침 후 (토큰 복구됨 — 동일 세션):**
```
모듈 평가 시 읽음: history.state.__next_session_token = "abc123"
                   history.state.__next_navigation_stack_index = 2
initializeHistoryStateSyncOnce()가 token = "abc123", index = 2 복원
→ 새로고침된 entry가 세션 "abc123"으로 복귀
→ navigation을 index로 추적 (앞으로가기/뒤로가기 올바르게 감지)
```

**첫 방문 또는 진짜 새 세션 (메타데이터 없음):**
```
모듈 평가 시 읽음: history.state에 __next_session_token 없음
initializeHistoryStateSyncOnce()가 새 token = "xyz789" 생성
→ 토큰 없는 이전 entry → isTokenMismatch = true → history.go(1)
```

**정상 internal navigation:**
```
currentToken = "abc123", nextState.token = "abc123"
→ Token 일치 ✓ 정상 index 기반 처리
```

### 중요한 범위 제한: 외부 도메인으로 나갔다 돌아오는 동작은 인터셉트 대상이 아님

사용자가 다른 origin으로 이동하면 현재 페이지는 언로드됩니다. 그 상태에서는
이 라이브러리가 실행될 수 없고, 우리 앱이 비활성 상태인 동안 발생한 이동은
`popstate`로 제어할 수 없습니다.

---

## 정리

| 문제 | 원인 | 해결책 |
|------|------|--------|
| **URL 복원** | 브라우저가 JS 전에 URL 변경 | `history.go()`로 복원 |
| **방향 감지** | popstate가 양방향 모두 발생 | pushState patch로 index 주입 |
| **세션 경계 감지** | 라이브러리 도입 전 entry나 다른 세션의 entry는 메타데이터가 없거나 토큰이 다름 | 모듈 평가 시점에 세션 토큰 복구 (Next.js 하이드레이션이 `history.state`를 덮어쓰기 전); token-mismatch 경로는 진짜 경계만 처리 |

Next.js는 `beforePopState`로 navigation intercept 방법은 제공하지만, 어려운 문제들은 개발자에게 맡깁니다. 이 라이브러리가 그 문제들을 해결합니다.

---

## 관련 파일

| File | 역할 |
|------|------|
| `src/useInterceptPopState.helper/history-augmentation.ts` | History API patch (index/token 주입) |
| `src/useInterceptPopState.ts` | popstate intercept 및 처리 |
