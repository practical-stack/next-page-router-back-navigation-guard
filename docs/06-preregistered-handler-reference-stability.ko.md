# preRegisteredHandler 참조 안정성과 상태 동기화 문제

## 요약

`preRegisteredHandler`는 **반드시 stable reference를 유지**해야 합니다.
그렇지 않으면 라이브러리 내부의 `interceptionStateContext` 상태가 초기화되어,
async 핸들러에서 "나가기"를 클릭해도 네비게이션이 제대로 동작하지 않습니다.

**해결책:**
1. `useCallback`으로 `preRegisteredHandler` 메모이제이션
2. `useCurrentOverlayRef` 패턴으로 최신 overlay 값 참조

---

## 버그 히스토리

### 발견된 증상

> **새로고침 후** 뒤로가기 → 모달 표시 → "나가기" 클릭 → **URL은 변경되지만 페이지 콘텐츠가 업데이트되지 않음**

새로고침 없이는 정상 동작하는 것처럼 보였으나, 실제로는 동일한 버그가 잠재되어 있었습니다.

### 근본 원인

`preRegisteredHandler`가 `useCallback` 없이 정의되어 **매 렌더마다 새 함수 참조로 생성**됨.
이로 인해 어떤 이유로든 리렌더가 발생하면 `useIsomorphicLayoutEffect`가 재실행되면서 
`interceptionStateContext`가 새로 생성됨.

**주의**: `currentOverlayRef`(ref)를 사용하는 것은 함수 내부에서 최신 값을 참조하기 위한 것이지,
함수 참조 자체를 안정화하지 않습니다.

이로 인해 이전 async IIFE에서 설정한 `isNavigationConfirmed = true` 상태가 유실됨.

---

## 라이브러리 코드 구조

```typescript
// use-intercept-popstate.ts
export function useInterceptPopState({
  handlerMap,
  preRegisteredHandler,
}: {
  handlerMap: Map<string, HandlerDef>;
  preRegisteredHandler?: () => boolean;
}) {
  const pagesRouter = useContext(RouterContext);

  useIsomorphicLayoutEffect(() => {
    const popstateHandler = createPopstateHandler(
      handlerMap,
      preRegisteredHandler
    );

    pagesRouter.beforePopState(() => popstateHandler(history.state));

    return () => {
      pagesRouter.beforePopState(() => true);
    };
  }, [pagesRouter, preRegisteredHandler]);  // ← preRegisteredHandler가 deps에 있음
}

const createPopstateHandler = (...) => {
  const interceptionStateContext = createInterceptionStateContext();  // ← 상태가 여기서 생성됨!
  // interceptionStateContext 내부에 isNavigationConfirmed 등의 상태가 캡슐화됨

  return (historyState) => {
    // Case 1: 핸들러가 네비게이션 승인한 경우
    if (interceptionStateContext.getState().isNavigationConfirmed) {
      interceptionStateContext.setState({ isNavigationConfirmed: false });
      return true;  // ← 네비게이션 허용
    }
    
    // ... 다른 케이스들 ...
    
    // Case 5: 뒤로가기 처리
    (async () => {
      const shouldAllowNavigation = await runHandlerChainAndGetShouldAllowNavigation(...);
      if (shouldAllowNavigation) {
        interceptionStateContext.setState({ isNavigationConfirmed: true });  // ← 여기서 true 설정
        window.history.go(delta);
      }
    })();
    
    return false;
  };
};
```

---

## 버그 발생 메커니즘

### 정상 동작 (stable `preRegisteredHandler`)

```
시간 →

[T0] 유저가 뒤로가기 클릭
     │
     ▼
[T1] popstateHandler_A 호출 (state_A.isNavigationConfirmed = false)
     │
     ▼
[T2] 다이얼로그 표시, 유저 입력 대기...
     │
     ▼
[T3] 유저가 "나가기" 클릭
     │
     ▼
[T4] state_A.isNavigationConfirmed = true 설정
     │
     ▼
[T5] history.go(delta) 호출
     │
     ▼
[T6] 새 popstate 발생 → popstateHandler_A 호출
     │
     ▼
[T7] state_A.isNavigationConfirmed === true → 네비게이션 허용 ✅
```

**핵심:** 같은 `popstateHandler_A` 인스턴스가 계속 사용되므로 `state_A` 상태가 유지됨.

---

### 문제 상황 (unstable `preRegisteredHandler`)

`useCallback` 없이 사용하면:

```tsx
// ❌ 매 렌더마다 새 함수 참조 생성
const preRegisteredHandler = () => {
  if (currentOverlayRef.current) {
    overlay.close(currentOverlayRef.current);
    return false;
  }
  return true;
};
```

**주의**: ref를 사용하는 것은 함수 내부에서 최신 값을 참조하기 위한 것이지, 함수 참조 자체를 안정화하지 않습니다. `useCallback` 없이 정의하면 매 렌더마다 새 함수가 생성됩니다.

```
시간 →

[T0] 유저가 뒤로가기 클릭
     │
     ▼
[T1] popstateHandler_A 호출 (state_A: isNavigationConfirmed = false)
     │
     ▼
[T2] 다이얼로그 표시, 유저 입력 대기 중 어떤 이유로든 리렌더 발생
     │
     ▼
[T2.1] OverlayGuardHandler 리렌더 → preRegisteredHandler 새 함수로 생성
     │
     ▼
[T2.2] Effect 재실행:
       ┌───────────────────────────────────────────────────────────┐
       │ cleanup: popstateHandler_A 해제                           │
       │ setup:   popstateHandler_B 새로 생성                      │
       │          (state_B: isNavigationConfirmed = false)         │  ← 새 상태!
       └───────────────────────────────────────────────────────────┘
     │
     ▼
[T3] 유저가 "나가기" 클릭
     │
     ▼
[T4] state_A.isNavigationConfirmed = true 설정
     │  (하지만 popstateHandler_A는 이미 해제됨!)
     │
     ▼
[T5] history.go(delta) 호출 → URL 변경됨
     │
     ▼
[T6] 새 popstate 발생 → popstateHandler_B 호출 (현재 등록된 핸들러)
     │
     ▼
[T7] state_B.isNavigationConfirmed === false → beforePopState가 false 반환
     │
     ▼
[T8] URL은 이전 페이지지만, Next.js가 페이지 업데이트 안 함 ❌
```

---

## 시각적 비교

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Stable preRegisteredHandler                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  popstateHandler_A (state_A)                                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ state_A.isNavigationConfirmed = false → true                │   │
│  │                                   ↑                         │   │
│  │ [T1]                           [T4]                   [T7]  │   │
│  │  호출 ────────────────────────  설정 ─────────────────  확인 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              같은 인스턴스 ✅                        │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                   Unstable preRegisteredHandler                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  popstateHandler_A (해제됨)     popstateHandler_B (새로 생성)        │
│  ┌────────────────────────┐   ┌────────────────────────────────┐   │
│  │ state_A                │   │ state_B                        │   │
│  │ .isNavigationConfirmed │   │ .isNavigationConfirmed         │   │
│  │ = false → true         │   │ = false                        │   │
│  │      ↑                 │   │                           ↑    │   │
│  │ [T1] [T4]              │   │                          [T7]  │   │
│  │  호출  설정             │   │                          확인  │   │
│  └────────────────────────┘   └────────────────────────────────┘   │
│         ↑                              ↑                           │
│    이 상태에 설정했지만...        이 상태는 false! ❌                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 왜 새로고침 후에만 문제가 발생하는 것처럼 보였는가?

실제로는 **새로고침 여부와 무관하게 버그가 존재**했습니다.
다만 React의 렌더링 타이밍에 따라 발현 방식이 달랐습니다.

| 상황 | React 동작 모드 | 리렌더 처리 | 결과 |
|------|---------------|------------|------|
| **새로고침 후** | Initial Mount | 동기적(synchronous) 즉시 처리 | 리렌더 시 즉시 effect 재실행 → 상태 유실 → **URL만 변경, 페이지 그대로** |
| **새로고침 없이** | Update Mode | 배칭(batching) / 지연 가능 | 타이밍에 따라 동작하거나, 모달 두 번 뜨는 등 다른 증상 |

### 새로고침 없이 발생할 수 있는 다른 증상들

1. **모달이 두 번 표시**: effect 재실행으로 상태 리셋 → 핸들러 재실행
2. **두 번째 클릭에서 동작**: 첫 "나가기"는 실패, 다시 뜬 모달에서 성공
3. **간헐적 실패**: 리렌더 타이밍에 따라 랜덤하게 동작/실패

---

## 해결책

### 1. useCallback으로 preRegisteredHandler 메모이제이션 (필수)

```tsx
// web-back-navigation-handler-context.tsx
const OverlayGuardHandler = ({ handlerMap }: { handlerMap: Map<string, HandlerDef> }) => {
  const currentOverlayRef = useCurrentOverlayRef();

  // ✅ useCallback으로 stable reference 유지
  // 이를 통해 useInterceptPopState의 effect가 불필요하게 재실행되지 않음
  const preRegisteredHandler = useCallback(() => {
    if (currentOverlayRef.current) {
      overlay.close(currentOverlayRef.current);
      return false;
    }
    return true;
  }, []); // currentOverlayRef는 ref이므로 의존성 불필요

  useInterceptPopState({ handlerMap, preRegisteredHandler });

  return null;
};
```

### 2. useCurrentOverlayRef 패턴 (최신 값 참조용)

```tsx
/**
 * overlay 상태를 ref로 래핑하여 stable reference 유지
 * 
 * 왜 필요한가:
 * - useCurrentOverlay()는 매 렌더마다 새 값을 반환할 수 있음
 * - 이 값을 직접 useCallback deps에 넣으면 함수가 재생성됨
 * - ref를 사용하면 함수 참조는 유지하면서 최신 값 접근 가능
 */
function useCurrentOverlayRef() {
  const currentOverlay = useCurrentOverlay();
  const ref = useRef(currentOverlay);

  useEffect(() => {
    ref.current = currentOverlay;
  }, [currentOverlay]);

  return ref;
}
```

---

## 왜 이 패턴이 안전한가

1. **ref 객체 자체는 stable**: 컴포넌트 생명주기 동안 동일한 참조 유지
2. **ref.current 업데이트는 useEffect 내에서**: 렌더 중 side effect 없음 (React 규칙 준수)
3. **popstate는 유저 액션 후에 발생**: effect가 이미 실행된 상태이므로 최신 값 보장
4. **useCallback deps가 빈 배열**: 함수 참조가 변경되지 않아 effect 재실행 방지

---

## 핵심 원칙

> `preRegisteredHandler`가 변경되면:
>
> 1. **Effect가 재실행**됨 (deps에 포함되어 있으므로)
> 2. **새로운 `popstateHandler` 클로저 생성** (`createPopstateHandler` 호출)
> 3. **새로운 `interceptionStateContext` 생성** (모든 상태 초기화)
> 4. 이전 async 핸들러가 설정한 상태는 **이전 클로저에만 존재**
> 5. 새 popstate는 **새 클로저의 state**를 확인 → `isNavigationConfirmed === false` → 차단
>
> **따라서 `useCallback(fn, [])`으로 stable reference를 유지하는 것이 필수입니다.**

---

## 관련 파일

- `src/BackNavigationHandlerProvider.tsx` - Provider 컴포넌트
- `src/useInterceptPopState.ts` - effect deps에 `preRegisteredHandler` 포함
- `src/useInterceptPopState.helper/interception-state.ts` - `isNavigationConfirmed` 상태 관리
- `example/src/pages/_app.tsx` - `useCallback` 적용, `useCurrentOverlayRef` 패턴 사용 예시
