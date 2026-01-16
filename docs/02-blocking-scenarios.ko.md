# 차단 시나리오

이 문서는 `next-page-router-back-navigation-guard`가 처리하는 모든 뒤로가기 차단 시나리오를 상세히 설명합니다.

---

## 목차

1. [핵심 메커니즘](#핵심-메커니즘)
2. [시나리오 1: 일반 뒤로가기](#시나리오-1-일반-뒤로가기)
3. [시나리오 2: 앞으로가기](#시나리오-2-앞으로가기)
4. [시나리오 3: 다단계 히스토리 이동](#시나리오-3-다단계-히스토리-이동)
5. [시나리오 4: Token Mismatch](#시나리오-4-token-mismatch)
6. [시나리오 5: router.back()](#시나리오-5-routerback)
7. [시나리오 6: 핸들러에서 router.push()로 리다이렉트](#시나리오-6-핸들러에서-routerpush로-리다이렉트)
8. [내부 처리 시나리오](#내부-처리-시나리오)
9. [전체 흐름도](#전체-흐름도)

---

## 핵심 메커니즘

### History API 패치

브라우저의 History API는 현재 위치 `index`를 제공하지 않습니다. `pushState`와 `replaceState`를 패치하여 메타데이터를 주입합니다:

```typescript
{
  __next_session_token: string,          // 세션 식별자
  __next_navigation_stack_index: number  // 히스토리 스택 위치
}
```

### Popstate 인터셉션

Next.js Pages Router의 `beforePopState` 콜백을 사용하여 뒤로가기/앞으로가기를 가로챕니다.

---

## 시나리오 1: 일반 뒤로가기

**상황**: 페이지1 → 페이지2에서 뒤로가기 버튼 클릭

```
[Page2] ← Back button clicked
    │
    ▼
popstate event fired
    │
    ▼
handler callback executed (e.g., confirm dialog)
    │
    ├── User selects "Cancel"
    │     └→ history.go(1) called → Stay on Page2
    │
    └── User selects "OK"
          └→ popstate re-dispatched → Navigate to Page1
```

| 항목 | 값 |
|------|-----|
| `to` | `/page1` |
| 차단 조건 | handler 콜백이 `false` 반환 |

---

## 시나리오 2: 앞으로가기

**상황**: 페이지1 ← 페이지2 (뒤로가기 후) → 앞으로가기 버튼 클릭

```
[Page1] → Forward button clicked
    │
    ▼
popstate event fired
    │
    ▼
delta calculation: nextIndex(1) - currentIndex(0) = 1
    │
    ▼
delta > 0, detected as forward navigation
    │
    ▼
Allow without handler callback → Navigate to Page2
```

**참고**: 앞으로가기(delta > 0)는 차단하지 않고 항상 허용됩니다.

---

## 시나리오 3: 다단계 히스토리 이동

**상황**: 페이지1 → 페이지2 → 페이지3 → 페이지4에서 브라우저 히스토리 메뉴로 페이지1 직접 선택

```
Right-click back button → Select "Page1" from history menu
    │
    ▼
delta = 0 - 3 = -3
    │
    ▼
handler callback executed
    │
    ├── Cancel → history.go(3) → Stay on Page4
    └── OK → Navigate to Page1
```

이런 경우가 발생하는 상황:
1. 뒤로가기 버튼 롱클릭/우클릭 → 히스토리 목록에서 선택
2. 코드에서 `history.go(-3)` 호출
3. 브라우저 확장 프로그램의 히스토리 조작

---

## 시나리오 4: Token Mismatch

**새로고침** 및 **외부 도메인 진입** 처리

**상황 A**: 내 사이트 → 구글 → 뒤로가기로 내 사이트 복귀
**상황 B**: 페이지 새로고침 후 뒤로가기

```
Back button clicked
    │
    ▼
popstate event fired
    │
    ▼
isNavigationConfirmed 플래그 확인
    │
    ├── true → 네비게이션 허용 (핸들러가 이미 확인함)
    │          플래그 초기화, token/index 업데이트, return true
    │
    └── false → token mismatch 검사 진행
          │
          ▼
    isTokenMismatch = true 감지
    (token 없음 또는 현재 세션과 불일치)
          │
          ▼
    handler 콜백 전 URL 복원 필요
          │
          ▼
    isRestoringUrl = true
          │
          ▼
    history.go(1) 호출 → URL 복원 (앞으로 이동)
          │
          ▼
    setTimeout: 비동기 handler 콜백 실행
          │
          ├── Cancel (handler가 false 반환)
          │     └→ 현재 페이지 유지
          │
          └── OK (handler가 true 반환)
                └→ 새 token/index 설정
                └→ isNavigationConfirmed = true  ← 중요: back() 호출 전에 설정
                └→ window.history.back() 재호출
                └→ 다음 popstate에서 isNavigationConfirmed=true 확인
                └→ 이전 페이지로 이동
```

**URL 복원 전략**:
- popstate 시점에 `window.location.href`는 이미 목적지 URL로 변경됨
- `pushState(state, "", window.location.href)` 사용 시 잘못된 URL push
- 대신 `history.go(1)`로 앞으로 이동 (뒤로가기로 왔으므로)

**Token Mismatch 감지 조건**:
- `history.state`에 `__next_session_token` 없음
- 또는 token이 현재 세션과 불일치 (새로고침 시 재생성)

**isNavigationConfirmed 플래그**:
- handler가 네비게이션을 허용하면 (true 반환) `history.back()` 호출
- 이는 또 다른 popstate 이벤트를 발생시키고, 다시 token mismatch로 감지됨
- `isNavigationConfirmed` 플래그로 이 후속 popstate를 허용 처리
- **중요**: 플래그는 반드시 `history.back()` 호출 전에 설정해야 함

---

## 시나리오 5: router.back()

**상황**: 코드에서 `router.back()` 호출

```tsx
<button onClick={() => router.back()}>Back</button>
```

```
router.back() called
    │
    ▼
Internally executes history.back()
    │
    ▼
popstate event fired
    │
    ▼
(Same flow as Scenario 1)
```

---

## 시나리오 6: 핸들러에서 router.push()로 리다이렉트

**상황**: 핸들러가 뒤로가기를 차단하고 다른 페이지로 리다이렉트

```tsx
useRegisterBackNavigationHandler(() => {
  router.push('/different-page');  // 뒤로가기 대신 리다이렉트
  return false;  // 원래 뒤로가기 차단
});
```

### 왜 까다로운가

뒤로가기가 감지되면 핸들러가 실행되고 `router.push()`를 호출합니다. 하지만 `history.go()`는 **비동기**(MDN 참조)이므로, 핸들러를 즉시 실행하면 히스토리 스택이 손상될 수 있습니다:

```
❌ 잘못된 방식: 뒤로가기 감지 후 즉시 핸들러 실행
    │
    ▼
1. 뒤로가기 감지, URL 복원을 위해 history.go(-delta) 호출
2. 핸들러 즉시 실행 (async IIFE)
3. router.push('/different-page') 실행
4. history.go(-delta)가 push 이후에 완료됨
   → 히스토리 스택 손상!
```

### MDN 준수 해결책

`delta = 0`인 popstate 이벤트를 수신하여 `history.go()` 완료를 대기합니다:

```
✅ 올바른 방식: popstate로 history.go() 완료 대기
    │
    ▼
1. 뒤로가기 감지 (delta < 0)
    │
    ▼
2. pendingHandlerExecution = true 설정, pendingHistoryIndexDelta 저장
    │
    ▼
3. URL 복원을 위해 history.go(-delta) 호출
    │
    ▼
4. false 반환 (Next.js 네비게이션 차단)
    │
    ▼
5. delta = 0인 popstate 발생 (복원 완료)
    │
    ▼
6. pendingHandlerExecution === true 확인
    │
    ▼
7. 이제 안전하게 핸들러 실행
    │
    ├── 핸들러가 router.push('/different-page') 호출
    │   → 정상 작동, 히스토리 스택 유지
    │
    └── 핸들러가 true 반환
        → history.go(pendingHistoryIndexDelta) 호출하여 뒤로 이동
```

> **MDN 참조**: "이 메서드는 비동기입니다. popstate 이벤트 리스너를 추가하여 네비게이션 완료 시점을 알 수 있습니다."
> — [MDN Web Docs: History.go()](https://developer.mozilla.org/en-US/docs/Web/API/History/go)

### 관련 상태

| 상태 | 목적 |
|------|------|
| `pendingHandlerExecution` | history.go() 완료 대기 중일 때 true |
| `pendingHistoryIndexDelta` | 핸들러 승인 후 네비게이션을 위한 저장된 delta |

---

## 내부 처리 시나리오

### 시나리오 7: Delta가 0인 경우 (핸들러 실행 대기 또는 복원)

차단 후 `history.go(-delta)` 호출 시 delta = 0인 popstate가 발생합니다. 이는 다음을 의미할 수 있습니다:
1. **핸들러 실행 대기**: URL 복원 완료, 이제 핸들러 실행
2. **단순 복원**: 무시 (무한 루프 방지)

```
User back → handler cancel → history.go(1) called
    │
    ▼
popstate re-fired
    │
    ▼
delta = currentIndex - currentIndex = 0
    │
    ▼
Event ignored (infinite loop prevention)
```

### 시나리오 8: Token Mismatch 복원 Popstate

Token mismatch 차단 시 `history.go(1)` 호출로 또 다른 popstate가 발생합니다. `isRestoringUrl` 플래그로 무시합니다.

```
Token Mismatch detected → history.go(1) called
    │
    ▼
isRestoringUrl = true
    │
    ▼
popstate re-fired (by go(1))
    │
    ▼
Check isRestoringUrl
    │
    ▼
If true → Clear flag and ignore event
```

### 시나리오 9: 새로고침 후 Once 핸들러 (빈 HandlerMap + preRegisteredHandler)

`once: true` 핸들러가 실행 후 삭제되면, 이후 뒤로가기에서 handlerMap이 비어있지만 여전히 `preRegisteredHandler`를 실행해야 합니다.

```
once: true 핸들러가 있는 페이지 새로고침
    │
    ▼
첫 번째 뒤로가기 → 핸들러 실행, 다이얼로그 표시, 차단
    │                핸들러 삭제됨 (once: true)
    │
    ▼
두 번째 뒤로가기 → Token mismatch, handlerMap 비어있음
    │
    ▼
preRegisteredHandler 실행 (모달 닫음) → 차단
    │
    ▼
URL 복원: history.go(1) ← 핵심!
    │
    ▼
세 번째 뒤로가기 → Token mismatch, 핸들러 없음, 오버레이 없음
    │
    ▼
네비게이션 허용 → 이전 페이지로 이동
```

**URL 복원이 중요한 이유**:

2단계에서 `history.go(1)` 없이:
- 브라우저 URL이 이전 페이지로 변경됨 (popstate 이미 발생)
- 하지만 `false` 반환으로 Next.js는 현재 페이지 유지
- 브라우저 URL과 Next.js 상태가 **동기화되지 않음**
- 세 번째 뒤로가기가 첫 번째 히스토리 항목 이전으로 가려함 → `about:blank`

`history.go(1)` 사용 시:
- preRegisteredHandler 차단 후 현재 페이지로 URL 복원
- 브라우저와 Next.js 동기화 유지
- 세 번째 뒤로가기가 올바르게 이전 페이지로 이동

---

## 전체 흐름도

```
+------------------------------------------------------------------+
|                    Back/Forward button clicked                    |
+------------------------------------------------------------------+
                                   │
                                   ▼
+------------------------------------------------------------------+
|                      popstate event fired                         |
+------------------------------------------------------------------+
                                   │
                                   ▼
                    +--------------------------+
                    │ isNavigationConfirmed?   │  ← 먼저 확인
                    +--------------------------+
                         │              │
                        YES            NO
                         │              │
                         ▼              ▼
                   +----------+  +--------------------------+
                   │ 플래그   │  │ Token Mismatch?          │
                   │ 초기화,  │  │ (token 없음/불일치)      │
                   │ 허용     │  +--------------------------+
                   +----------+       │              │
                                    YES            NO
                                     │              │
                                     ▼              ▼
                   +-------------------------+  +--------------+
                   │ isRestoringUrl          │  │ delta === 0? │
                   │ flag?                   │  +--------------+
                   +-------------------------+       │      │
                          │          │             YES     NO
                         YES        NO              │       │
                          │          │              ▼       ▼
                          ▼          ▼       +---------+  +--------------+
                   +----------+  +--------+  │ Ignore  │  │ delta > 0?   │
                   │ 플래그   │  │ handler│  +---------+  │ (forward)    │
                   │ 초기화,  │  │ 있음?  │               +--------------+
                   │ 무시     │  +--------+                    │      │
                   +----------+    │    │                    YES     NO
                                 YES   NO                     │       │
                                  │     │                     ▼       ▼
                          +----------+ +-----+         +---------+  +----------+
                          │ go(1)    │ │허용 │         │ 허용    │  │ handler  │
                          │ +플래그  │ +-----+         +---------+  │ 있음?    │
                          +----------+                              +----------+
                                │                                      │    │
                                ▼                                    YES   NO
                          +--------------+                             │     │
                          │ setTimeout   │                             ▼     ▼
                          │ handler 호출 │                      +----------+ +-----+
                          +--------------+                      │ handler  │ │허용 │
                                │                               │ callback │ +-----+
                     +----------+----------+                    +----------+
                     │                     │                         │
                     ▼                     ▼              +----------+----------+
               +----------+         +----------+          │                     │
               │ 허용     │         │ 차단     │          ▼                     ▼
               │ 플래그   │         │ 유지     │    +----------+         +----------+
               │ back()   │         +----------+    │ 허용     │         │ 차단     │
               +----------+                         │ 플래그   │         │ go(-delta)│
                                                    │ go(delta)│         │ 복원     │
                                                    +----------+         +----------+
```

---

## 공개 API

```typescript
function useRegisterBackNavigationHandler(
  handler: BackNavigationHandler,
  options?: PartialBackNavigationHandlerOptions
): void;

// Handler 타입: true = 허용, false = 차단
type BackNavigationHandler = () => boolean;

interface PartialBackNavigationHandlerOptions {
  once?: boolean;      // 실행 후 자동 해제 (기본값: false)
  enable?: boolean;    // 조건부 등록 (기본값: true)
  override?: boolean;  // 우선순위 핸들러 (기본값: false)
  overridePriority?: 0 | 1 | 2 | 3;  // 우선순위 레벨 (기본값: 1)
}
```

---

## 관련 파일

| 파일 | 역할 |
|------|------|
| `src/useInterceptPopState.ts` | Popstate 인터셉션 (핵심 로직) |
| `src/useRegisterBackNavigationHandler.ts` | 핸들러 등록 훅 |
| `src/useInterceptPopState.helper/history-augmentation.ts` | History API 패치 |
| `src/BackNavigationHandlerProvider.tsx` | Provider 컴포넌트 |
