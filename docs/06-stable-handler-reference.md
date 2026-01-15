# useCurrentOverlayRef 패턴 설명

## 요약

`preRegisteredHandler`는 반드시 stable reference를 유지해야 합니다. 그렇지 않으면 라이브러리 내부의 `isAllowingNavigation` 플래그가 초기화되어 async 핸들러가 "Leave"를 클릭해도 네비게이션이 차단됩니다.

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
    const handlePopState = createHandlePopState(
      handlerMap,
      writeState,
      preRegisteredHandler
    );

    pagesRouter.beforePopState(() => handlePopState(history.state));

    return () => {
      pagesRouter.beforePopState(() => true);
    };
  }, [pagesRouter, preRegisteredHandler]);  // ← preRegisteredHandler가 deps에 있음
}

function createHandlePopState(...) {
  const flags = createNavigationFlags();  // ← 플래그들이 여기서 생성됨!
  // flags 내부에 isAllowingNavigation 등의 상태가 캡슐화됨

  return (nextState) => {
    // ...
    if (flags.isNavigationAllowed()) {
      flags.consumeNavigationAllowed();
      return true;
    }
    // ...
    
    (async () => {
      const shouldContinue = await handler();
      if (shouldContinue) {
        flags.allowNextNavigation();  // ← 여기서 true로 설정
        window.history.go(delta);
      }
    })();
    
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
[T1] handlePopState_A 호출 (flags_A.isNavigationAllowed() = false)
     │
     ▼
[T2] 다이얼로그 표시, 유저 입력 대기...
     │
     ▼
[T3] 유저가 "Leave" 클릭
     │
     ▼
[T4] flags_A.allowNextNavigation() 호출
     │
     ▼
[T5] history.go(delta) 호출
     │
     ▼
[T6] 새 popstate 발생 → handlePopState_A 호출
     │
     ▼
[T7] flags_A.isNavigationAllowed() === true → 네비게이션 허용 ✅
```

**핵심:** 같은 `handlePopState_A` 인스턴스가 계속 사용되므로 `flags_A` 플래그 상태가 유지됨.

---

## 문제 상황 (`preRegisteredHandler`가 변경될 때)

`useCallback` 없이 또는 `[currentOverlay]` deps로 사용하면:

```tsx
// preRegisteredHandler가 매 렌더 또는 currentOverlay 변경시 새로 생성됨
const preRegisteredHandler = () => {
  if (currentOverlay) { ... }
};
```

```
시간 →

[T0] 유저가 뒤로가기 클릭
     │
     ▼
[T1] handlePopState_A 호출 (flags_A: isNavigationAllowed = false)
     │
     ▼
[T2] 다이얼로그 표시 → currentOverlay 변경됨!
     │
     ▼
[T2.1] _app 리렌더 → preRegisteredHandler 새 함수로 생성
     │
     ▼
[T2.2] Effect 재실행:
       ┌─────────────────────────────────────────────────┐
       │ cleanup: handlePopState_A 해제                  │
       │ setup:   handlePopState_B 새로 생성             │
       │          (flags_B: isNavigationAllowed = false) │  ← 새 플래그!
       └─────────────────────────────────────────────────┘
     │
     ▼
[T3] 유저가 "Leave" 클릭
     │
     ▼
[T4] flags_A.allowNextNavigation() 호출
     │  (하지만 handlePopState_A는 이미 해제됨!)
     │
     ▼
[T5] history.go(delta) 호출
     │
     ▼
[T6] 새 popstate 발생 → handlePopState_B 호출 (현재 등록된 핸들러)
     │
     ▼
[T7] flags_B.isNavigationAllowed() === false → 네비게이션 차단! ❌
```

---

## 시각적 비교

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Stable preRegisteredHandler                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  handlePopState_A (flags_A)                                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ flags_A.isNavigationAllowed() = false → true                │   │
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
│  handlePopState_A (해제됨)     handlePopState_B (새로 생성)          │
│  ┌────────────────────────┐   ┌────────────────────────────────┐   │
│  │ flags_A                │   │ flags_B                        │   │
│  │ .isNavigationAllowed() │   │ .isNavigationAllowed()         │   │
│  │ = false → true         │   │ = false                        │   │
│  │      ↑                 │   │                           ↑    │   │
│  │ [T1] [T4]              │   │                          [T7]  │   │
│  │  호출  설정             │   │                          확인  │   │
│  └────────────────────────┘   └────────────────────────────────┘   │
│         ↑                              ↑                            │
│    이 플래그에 설정했지만...      이 플래그는 false! ❌              │
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
2. **새로운 `handlePopState` 클로저 생성** (`createHandlePopState` 호출)
3. **새로운 `createNavigationFlags()` 호출로 플래그 객체 생성** (모든 플래그 초기화)
4. 이전 async 핸들러가 설정한 플래그는 **이전 클로저의 flags 객체에만 존재**
5. 새 popstate는 **새 클로저의 flags**를 확인 → `isNavigationAllowed() === false` → 차단

그래서 `useCallback(fn, [])`으로 stable reference를 유지하고, ref로 최신 값을 읽는 패턴이 필요합니다.
