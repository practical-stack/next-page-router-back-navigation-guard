# useCurrentOverlayRef 패턴 설명

## 요약

`preRegisteredHandler`는 반드시 stable reference를 유지해야 합니다. 그렇지 않으면 라이브러리 내부의 `isNavigationConfirmed` 플래그가 초기화되어 async 핸들러가 "Leave"를 클릭해도 네비게이션이 차단됩니다.

---

## 라이브러리 코드 구조

```typescript
// useInterceptPopState.ts
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

function createPopstateHandler(...) {
  const interceptionStateContext = createInterceptionStateContext();  // ← 상태가 여기서 생성됨!
  // interceptionStateContext 내부에 isNavigationConfirmed 등의 상태가 캡슐화됨

  return (historyState) => {
    // ...
    if (interceptionStateContext.getState().isNavigationConfirmed) {
      interceptionStateContext.setState({ isNavigationConfirmed: false });
      return true;
    }
    // ...
    
    // Internal navigation case now uses pendingHandlerExecution pattern
    // to ensure history.go() completes before running handlers.
    // See 02-blocking-scenarios.md Scenario 6 for details.
    
    return false;
  };
}
```

---

## 정상 동작 (stable `preRegisteredHandler`)

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
[T3] 유저가 "Leave" 클릭
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

---

## 시각적 비교

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Stable preRegisteredHandler                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  popstateHandler_A (state_A)                                         │
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
│         ↑                              ↑                            │
│    이 상태에 설정했지만...        이 상태는 false! ❌                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 해결책: useCurrentOverlayRef 패턴

```tsx
function useCurrentOverlayRef() {
  const currentOverlay = useCurrentOverlay();
  const ref = useRef(currentOverlay);

  useEffect(() => {
    ref.current = currentOverlay;
  }, [currentOverlay]);

  return ref;
}

function AppContent({ Component, pageProps }) {
  const currentOverlayRef = useCurrentOverlayRef();

  const preRegisteredHandler = useCallback(() => {
    if (currentOverlayRef.current) {
      overlay.close(currentOverlayRef.current);
      return false;
    }
    return true;
  }, [currentOverlayRef]);

  return (
    <BackNavigationHandlerProvider preRegisteredHandler={preRegisteredHandler}>
      <Component {...pageProps} />
    </BackNavigationHandlerProvider>
  );
}
```

### 왜 안전한가

1. **ref 객체 자체는 stable**: 컴포넌트 생명주기 동안 동일한 참조 유지
2. **ref.current 업데이트는 useEffect 내에서**: 렌더 중 side effect 없음 (React 규칙 준수)
3. **popstate는 유저 액션 후에 발생**: effect가 이미 실행된 상태이므로 최신 값 보장
4. **useCallback deps가 빈 배열**: 함수 참조가 변경되지 않아 effect 재실행 없음

---

## 결론

`preRegisteredHandler`가 변경되면:

1. **Effect가 재실행**됨 (deps에 포함되어 있으므로)
2. **새로운 `popstateHandler` 클로저 생성** (`createPopstateHandler` 호출)
3. **새로운 `createInterceptionStateContext()` 호출로 상태 객체 생성** (모든 상태 초기화)
4. 이전 async 핸들러가 설정한 상태는 **이전 클로저의 state 객체에만 존재**
5. 새 popstate는 **새 클로저의 state**를 확인 → `isNavigationConfirmed === false` → 차단

그래서 `useCallback(fn, [])`으로 stable reference를 유지하고, ref로 최신 값을 읽는 패턴이 필요합니다.
