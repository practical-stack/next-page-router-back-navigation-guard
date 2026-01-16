# Why useCurrentOverlayRef Pattern

## Summary

`preRegisteredHandler` must maintain a stable reference. Otherwise, the library's internal `isNavigationConfirmed` flag gets reset, causing navigation to be blocked even when the user clicks "Leave" in an async handler.

---

## Library Code Structure

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
  }, [pagesRouter, preRegisteredHandler]);  // ← preRegisteredHandler is in deps
}

function createPopstateHandler(...) {
  const interceptionStateContext = createInterceptionStateContext();  // ← State created here!
  // interceptionStateContext encapsulates isNavigationConfirmed and other state

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

## Normal Operation (stable `preRegisteredHandler`)

```
Time →

[T0] User clicks back button
     │
     ▼
[T1] popstateHandler_A called (state_A.isNavigationConfirmed = false)
     │
     ▼
[T2] Dialog shown, waiting for user input...
     │
     ▼
[T3] User clicks "Leave"
     │
     ▼
[T4] state_A.isNavigationConfirmed = true set
     │
     ▼
[T5] history.go(delta) called
     │
     ▼
[T6] New popstate fired → popstateHandler_A called
     │
     ▼
[T7] state_A.isNavigationConfirmed === true → Navigation allowed ✅
```

**Key:** Same `popstateHandler_A` instance is used throughout, so `state_A` is preserved.

---

## Problem Scenario (when `preRegisteredHandler` changes)

Without `useCallback` or with `[currentOverlay]` deps:

```tsx
// preRegisteredHandler recreated on every render or currentOverlay change
const preRegisteredHandler = () => {
  if (currentOverlay) { ... }
};
```

```
Time →

[T0] User clicks back button
     │
     ▼
[T1] popstateHandler_A called (state_A: isNavigationConfirmed = false)
     │
     ▼
[T2] Dialog shown → currentOverlay changed!
     │
     ▼
[T2.1] _app re-renders → preRegisteredHandler recreated as new function
     │
     ▼
[T2.2] Effect re-runs:
       ┌───────────────────────────────────────────────────────┐
       │ cleanup: popstateHandler_A released                   │
       │ setup:   popstateHandler_B newly created              │
       │          (state_B: isNavigationConfirmed = false)     │  ← New state!
       └───────────────────────────────────────────────────────┘
     │
     ▼
[T3] User clicks "Leave"
     │
     ▼
[T4] state_A.isNavigationConfirmed = true set
     │  (but popstateHandler_A is already released!)
     │
     ▼
[T5] history.go(delta) called
     │
     ▼
[T6] New popstate fired → popstateHandler_B called (currently registered handler)
     │
     ▼
[T7] state_B.isNavigationConfirmed === false → Navigation blocked! ❌
```

---

## Visual Comparison

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
│  │  call ─────────────────────────  set ──────────────── check │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              Same instance ✅                        │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                   Unstable preRegisteredHandler                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  popstateHandler_A (released)     popstateHandler_B (newly created)  │
│  ┌────────────────────────┐   ┌────────────────────────────────┐   │
│  │ state_A                │   │ state_B                        │   │
│  │ .isNavigationConfirmed │   │ .isNavigationConfirmed         │   │
│  │ = false → true         │   │ = false                        │   │
│  │      ↑                 │   │                           ↑    │   │
│  │ [T1] [T4]              │   │                          [T7]  │   │
│  │  call  set             │   │                          check │   │
│  └────────────────────────┘   └────────────────────────────────┘   │
│         ↑                              ↑                            │
│    Set on this state, but...     This state is false! ❌            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Solution: useCurrentOverlayRef Pattern

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

### Why This Is Safe

1. **ref object itself is stable**: Same reference throughout component lifecycle
2. **ref.current update is in useEffect**: No side effects during render (React rules compliant)
3. **popstate occurs after user action**: Effect has already run, so latest value is guaranteed
4. **useCallback deps is empty array**: Function reference doesn't change, so effect won't re-run

---

## Conclusion

When `preRegisteredHandler` changes:

1. **Effect re-runs** (because it's in deps)
2. **New `popstateHandler` closure created** (`createPopstateHandler` called)
3. **New `createInterceptionStateContext()` call creates new state object** (all state reset)
4. State set by previous async handler **only exists in previous closure's state object**
5. New popstate checks **new closure's state** → `isNavigationConfirmed === false` → blocked

That's why you need `useCallback(fn, [])` to maintain a stable reference, and use ref to read the latest value.
