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
7. [시나리오 6: 뒤로가기 시 리다이렉트](#시나리오-6-뒤로가기-시-리다이렉트)
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
delta -1 저장 후 history.go(1)로 Page2 URL 복원
    │
    ▼
delta = 0 복원 popstate 도착 (또는 완료 fallback 실행)
    │
    ▼
handler callback 실행 (예: 확인 dialog)
    ├── "취소" → 복원된 Page2에 머무름
    └── "확인" → history.go(-1) → confirmed popstate 통과 → Page1 이동
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
delta -3 저장 후 history.go(3)으로 Page4 URL 복원
    │
    ▼
복원 완료 후 handler callback 실행
    ├── 취소 → Page4에 머무름
    └── 확인 → history.go(-3) → Page1 이동
```

이런 경우가 발생하는 상황:
1. 뒤로가기 버튼 롱클릭/우클릭 → 히스토리 목록에서 선택
2. 코드에서 `history.go(-3)` 호출
3. 브라우저 확장 프로그램의 히스토리 조작

---

## 시나리오 4: Token Mismatch

**진정한 세션 경계** 처리 — 라이브러리 메타데이터가 없는 항목, 또는 다른 세션의 토큰을 가진 항목

> **참고 (토큰 복원 변경 이후)**: 일반적인 페이지 새로고침은 더 이상 이 경로를 거치지 않습니다. `history-augmentation.ts`가 모듈 평가 시점(Next.js 하이드레이션이 덮어쓰기 전)에 `history.state`를 읽어 세션 토큰과 index를 현재 항목에 복원합니다. 따라서 새로고침된 페이지는 원래 세션에 다시 합류하고, 새로고침 후 뒤로가기는 index delta를 기반으로 내부 네비게이션(시나리오 1/2/6)으로 처리됩니다. 시나리오 4는 이제 진정한 세션 경계에만 해당합니다: 라이브러리 메타데이터 없이 작성된 히스토리 항목, 또는 완전히 다른 세션의 토큰을 가진 항목.

**상황 A**: 내 사이트 → 구글 → 뒤로가기로 내 사이트 복귀
**상황 B**: `__next_session_token`이 없는 히스토리 항목 (라이브러리 도입 이전 항목, 또는 완전히 다른 세션)

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
    history.go(1) 호출 → URL 복원 (앞으로 이동)
          │
          ▼
    token이 일치하는 복원 popstate가 delta === 0에 도착
    (또는 requestAnimationFrame + setTimeout fallback 실행)
          │
          ▼
    pending navigation을 consume하고 비동기 handler callback 실행
          │
          ├── Cancel (handler가 false 반환)
          │     └→ 현재 페이지 유지
          │
          └── OK (handler가 true 반환)
                └→ isNavigationConfirmed = true  ← 중요: back() 호출 전에 설정
                └→ window.history.go(-1) 재호출
                └→ 다음 popstate에서 isNavigationConfirmed=true 확인
                └→ 이전 페이지로 이동
```

**URL 복원 전략**:
- popstate 시점에 `window.location.href`는 이미 목적지 URL로 변경됨
- `pushState(state, "", window.location.href)` 사용 시 잘못된 URL push
- 대신 `history.go(1)`로 앞으로 이동 (뒤로가기로 왔으므로)

**Token Mismatch 감지 조건**:
- `history.state`에 `__next_session_token` 없음 (라이브러리 도입 전 항목이거나 외부에서 작성된 항목)
- 또는 token이 완전히 다른 세션에 속함 (일반적인 새로고침 후 케이스는 이제 내부 네비게이션으로 처리됨)

**세션 토큰 복원 (일반적인 새로고침)**:
- `history-augmentation.ts`가 모듈 평가 시점에 `history.state`를 캡처하여 Next.js 하이드레이션이 덮어쓰기 전에 처리함
- 새로고침 이전 상태의 세션 토큰과 히스토리 index가 현재 항목에 복원됨
- 일반적인 새로고침 후 현재 항목은 원래 세션에 다시 합류하므로 token이 **일치**하고, 뒤로가기는 내부 경로(시나리오 6)로 처리됨

**isNavigationConfirmed 플래그**:
- handler가 네비게이션을 허용하면 저장된 delta를 `history.go(-1)`로 재실행
- 이는 또 다른 popstate 이벤트를 발생시키고, 다시 token mismatch로 감지됨
- `isNavigationConfirmed` 플래그로 이 후속 popstate를 허용 처리
- **중요**: confirmation은 반드시 `history.go(-1)` 호출 전에 설정해야 함

**핸들러 콜백에 `requestAnimationFrame + setTimeout`을 사용하는 이유?**

token mismatch 경로와 내부 뒤로가기 경로(시나리오 6) 모두 `requestAnimationFrame(() => setTimeout(..., 0))` 폴백에 의존해 핸들러를 실행합니다. 두 경우의 근본 원인은 동일합니다:

- 페이지 새로고침 후, Next.js는 라이브러리가 발행하는 합성 `history.go()` 복원에 대해 `beforePopState`를 **호출하지 않음**
- 따라서 `history.go()` 완료를 알리는 `delta === 0` 후속 popstate가 도착하지 않음
- 이 신호 없이는 pending navigation이 소비되지 않아 핸들러가 실행되지 않음

rAF+setTimeout 폴백은 브라우저가 안정화된 후 핸들러를 정확히 한 번 실행합니다(`pendingNavigation.consume()`이 이중 실행을 방지):
1. `requestAnimationFrame` — 현재 페인트 이후, 브라우저 히스토리가 안정화된 후로 지연
2. `setTimeout(0)` — 남은 microtask와 대기 중인 이벤트 처리 완료
3. `pendingNavigation.consume()` — pending delta를 원자적으로 반환하고 비워 먼저 도착한 완료 경로만 handler 실행

**외부 도메인 진입은 인터셉트 가능한 케이스가 아닙니다**:

사용자가 다른 origin으로 이동하면 현재 페이지는 언로드됩니다. 이 라이브러리는
앱이 살아 있는 동안 발생한 `popstate`만 처리할 수 있으므로, 외부 도메인으로
나갔다 돌아오는 동작 자체를 제어하는 것은 범위 밖입니다.

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

## 시나리오 6: 뒤로가기 시 리다이렉트

**상황**: 뒤로가기를 허용하는 대신 다른 페이지로 리다이렉트

### 안전한 패턴 (권장)

**모달을 열고 사용자가 버튼을 클릭하게** 하여 네비게이션을 트리거합니다:

```tsx
useRegisterBackNavigationHandler(() => {
  // 1. 모달 열기 (fire-and-forget, await 없음)
  overlay.open(({ isOpen, close }) => (
    <RedirectModal
      isOpen={isOpen}
      close={close}
      onConfirm={() => router.push("/target-page")}  // 사용자 클릭 → 네비게이션
    />
  ));
  
  // 2. 즉시 반환 - 핸들러 완료
  return false;
});
```

#### 왜 동작하는가

```
뒤로가기 버튼 클릭
    │
    ▼
핸들러 실행
    │
    ├── 모달 열기 (동기, fire-and-forget)
    │
    └── false 즉시 반환
          │
          ▼
    뒤로가기 차단, URL 복원
          │
          ▼
    사용자에게 "대상 페이지로 이동" 버튼이 있는 모달 표시
          │
          ▼
    사용자가 버튼 클릭 (사용자 활성화!)
          │
          ▼
    router.push('/target-page') 실행
          │
          ▼
    네비게이션 성공 ✅
```

#### 구현 참고사항

1. **Fire-and-forget**: 모달을 `await`하지 마세요. 핸들러는 동기적으로 반환해야 합니다.
2. **사용자 활성화**: 버튼 클릭이 "사용자 활성화"를 제공하며, 브라우저는 보안 이벤트 후 네비게이션에 이를 요구합니다.
3. **모달 상태**: `overlay-kit`같은 자체 상태를 관리하는 오버레이/모달 라이브러리를 사용하면 핸들러 반환 후에도 모달이 유지됩니다.

---

### 위험한 패턴 (권장하지 않음)

핸들러 내부에서 직접 `router.push()` 호출:

```tsx
// ⚠️ 권장하지 않음 - 페이지 새로고침 후 문제 발생
useRegisterBackNavigationHandler(() => {
  router.push('/different-page');  // 뒤로가기 대신 리다이렉트
  return false;  // 원래 뒤로가기 차단
});
```

#### 왜 문제가 되는가

이 패턴은 일반 조건에서는 동작하지만 **페이지 새로고침 후 실패**합니다:
- 브라우저 보안 정책이 사용자 활성화 없이 네비게이션을 차단할 수 있음
- `history.go()` 완료와 `router.push()` 타이밍이 예측 불가능해짐

#### 내부 구현 (처리 방식)

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

`delta = 0`인 popstate 이벤트를 수신하여 `history.go()` 완료를 대기합니다:

```
✅ 올바른 방식: popstate로 history.go() 완료 대기
    │
    ▼
1. 뒤로가기 감지 (delta < 0)
    │
    ▼
2. pendingNavigation = true 설정, pending navigation delta 저장
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
6. pendingNavigation === true 확인
    │
    ▼
7. 이제 안전하게 핸들러 실행
    │
    ├── 핸들러가 router.push('/different-page') 호출
    │   → 정상 작동, 히스토리 스택 유지
    │
    └── 핸들러가 true 반환
        → history.go(pending navigation delta) 호출하여 뒤로 이동
```

**페이지 새로고침 후에는 `delta = 0` popstate가 도착하지 않습니다.** 새로고침 이후 Next.js는 라이브러리의 합성 `history.go()` 복원에 대해 `beforePopState`를 호출하지 않으므로, 위의 5단계가 실행되지 않습니다. 이 경우를 처리하기 위해 3단계에서 `requestAnimationFrame(() => setTimeout(..., 0))` 폴백도 함께 예약됩니다. 동일한 `pendingNavigation` 플래그를 통해 핸들러를 정확히 한 번 실행하며, popstate와 폴백 중 먼저 실행된 쪽이 플래그를 소비하면 나머지는 no-op이 됩니다.

> **MDN 참조**: "이 메서드는 비동기입니다. popstate 이벤트 리스너를 추가하여 네비게이션 완료 시점을 알 수 있습니다."
> — [MDN Web Docs: History.go()](https://developer.mozilla.org/en-US/docs/Web/API/History/go)

#### 관련 상태

| 상태 | 목적 |
|------|------|
| `pendingNavigation` | history.go() 완료 대기 중일 때 true |
| `pending navigation delta` | 핸들러 승인 후 네비게이션을 위한 저장된 delta |

---

### 비교

| 측면 | 안전한 패턴 | 위험한 패턴 |
|------|-------------|-------------|
| `router.push()` 호출 위치 | 버튼 onClick 내부 | 핸들러 내부 |
| 사용자 활성화 | 있음 (버튼 클릭) | 없음 |
| 핸들러 반환 시점 | 즉시 (`false`) | `router.push()` 후 |
| 새로고침 후 | ✅ 정상 동작 | ❌ 실패할 수 있음 |

### 예제 파일

- 안전한 패턴: `example/src/pages/redirect-safe.tsx`
- 위험한 패턴: `example/src/pages/redirect.tsx`

---

## 내부 처리 시나리오

### 시나리오 7: Delta가 0인 경우 (복원 완료)

URL 복원을 시작한 후 `history.go(-delta)` 호출 시 delta = 0인 popstate가 발생합니다. 의미는 pending navigation 유무에 따라 달라집니다:
1. **Pending navigation 존재**: URL 복원이 완료됐으므로 이를 consume하고 handler를 실행합니다.
2. **Pending navigation 없음**: fallback이 이미 navigation을 consume한 뒤 늦게 도착한 복원 echo이므로 무시합니다.

```
사용자 back → delta -1 저장 → history.go(1) 호출
    │
    ▼
popstate re-fired
    │
    ▼
delta = currentIndex - currentIndex = 0
    │
    ▼
pending navigation 존재 → consume → handler 실행
```

### 시나리오 8: Token Mismatch 복원 Popstate

Session boundary를 guard할 때 `history.go(1)` 호출로 또 다른 popstate가 발생합니다. 이 복원은 token이 일치하는 항목으로 되돌아오므로 echo는 내부 네비게이션 경로로 라우팅됩니다. `delta === 0` 분기는 pending navigation을 consume하고 handler를 실행하며(시나리오 7과 동일), boundary 전용 복원 플래그는 필요하지 않습니다.

```
Token Mismatch detected → history.go(1) called
    │
    ▼
popstate re-fired (by go(1)) → token 일치 항목으로 착지
    │
    ▼
내부 네비게이션으로 라우팅 → delta === 0
    │
    ▼
pending navigation consume 후 handler 실행 (시나리오 7과 동일)
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
두 번째 뒤로가기 → 내부 네비게이션 (index delta), handlerMap 비어있음
    │
    ▼
preRegisteredHandler 실행 (모달 닫음) → 차단
    │
    ▼
URL 복원: history.go(1) ← 핵심!
    │
    ▼
세 번째 뒤로가기 → 내부 네비게이션, 핸들러 없음, 오버레이 없음
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
Back/Forward 버튼 클릭
    │
    ▼
popstate 이벤트 발생
    │
    ▼
isNavigationConfirmed?  (핸들러가 이미 이 네비게이션을 승인함)
    ├── YES → isNavigationConfirmed 초기화, 네비게이션 허용
    └── NO
         │
         ▼
        Token Mismatch?  (token 없음 / 다른 세션)
         │
         ├── YES → handleSessionBoundary
         │          ├── 핸들러 등록됨?
         │          │    ├── YES → pending navigation(-1)을 시작하고 history.go(1)로
         │          │    │         URL 복원 후 delta-0 echo(또는 fallback)에서 핸들러 실행:
         │          │    │           ├── 허용 → 다음 navigation confirm, history.go(-1)
         │          │    │           └── 차단 → 유지
         │          │    └── NO  → preRegisteredHandler 실행
         │          │              ├── 차단 → history.go(1)로 복원
         │          │              └── 허용 → 착지한 항목 채택, 허용
         │          └── go(1) 복원의 echo는 token이 일치하는 항목에 도착하고
         │              아래 delta === 0 분기가 pending navigation을 consume
         │
         └── NO → handleInternalNavigation (index delta로 분류)
                   ├── delta === 0
                   │     ├── 대기 중 복원 있음? → 미뤄둔 핸들러 실행
                   │     └── 그 외 → 무시 (우리가 호출한 go() 복원의 echo)
                   ├── delta > 0  → forward 네비게이션 → 허용
                   └── delta < 0  → back 네비게이션
                         ├── 핸들러 등록됨?
                         │    ├── YES → pending navigation(delta)을 시작하고
                         │    │         history.go(-delta)로 URL 복원 후 핸들러 실행
                         │    │         (허용 → 다음 navigation confirm, go(delta);
                         │    │          차단 → 유지)
                         │    └── NO  → preRegisteredHandler 실행
                         │              ├── 차단 → history.go(-delta)로 복원
                         │              └── 허용 → 착지한 항목 채택, 허용
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
| `src/useInterceptPopState.ts` | Next.js `beforePopState` 연결 |
| `src/useInterceptPopState.helper/popstate-interceptor.ts` | popstate 분류와 복원/재실행 흐름 |
| `src/useInterceptPopState.helper/pending-navigation.ts` | 대기 중인 뒤로가기 delta |
| `src/useRegisterBackNavigationHandler.ts` | 핸들러 등록 훅 |
| `src/useInterceptPopState.helper/history-augmentation.ts` | History API 패치 |
| `src/BackNavigationHandlerProvider.tsx` | Provider 컴포넌트 |
