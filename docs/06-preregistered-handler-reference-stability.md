# preRegisteredHandler Reference Stability and State Synchronization

## Summary

`preRegisteredHandler` **must maintain a stable reference**.
Otherwise, the library's internal `interceptionStateContext` state gets reset,
causing navigation to not work properly even when the user clicks "Leave" in an async handler.

**Solution:**
1. Memoize `preRegisteredHandler` with `useCallback`
2. Use `useCurrentOverlayRef` pattern to access the latest overlay value

---

## Bug History

### Symptoms Discovered

> **After refresh**: Back navigation → Modal shown → Click "Leave" → **URL changes but page content doesn't update**

It appeared to work normally without refresh, but the same bug was latent.

### Root Cause

`preRegisteredHandler` was defined without `useCallback`, **creating a new function reference on every render**.
This caused `useIsomorphicLayoutEffect` to re-run whenever a re-render occurred,
which creates a new `interceptionStateContext`.

**Important**: Using `currentOverlayRef` (a ref) is for accessing the latest value inside the function,
not for stabilizing the function reference itself.

This caused the `isNavigationConfirmed = true` state set by the previous async IIFE to be lost.

---

## Library Code Structure

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
  }, [pagesRouter, preRegisteredHandler]);  // ← preRegisteredHandler is in deps
}

const createPopstateHandler = (...) => {
  const interceptionStateContext = createInterceptionStateContext();  // ← State created here!
  // interceptionStateContext encapsulates isNavigationConfirmed and other state

  return (historyState) => {
    // Case 1: Handler approved navigation
    if (interceptionStateContext.getState().isNavigationConfirmed) {
      interceptionStateContext.setState({ isNavigationConfirmed: false });
      return true;  // ← Allow navigation
    }
    
    // ... other cases ...
    
    // Case 5: Back navigation handling
    (async () => {
      const shouldAllowNavigation = await runHandlerChainAndGetShouldAllowNavigation(...);
      if (shouldAllowNavigation) {
        interceptionStateContext.setState({ isNavigationConfirmed: true });  // ← Set to true here
        window.history.go(delta);
      }
    })();
    
    return false;
  };
};
```

---

## Bug Mechanism

### Normal Operation (stable `preRegisteredHandler`)

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

### Problem Scenario (unstable `preRegisteredHandler`)

Without `useCallback`:

```tsx
// ❌ New function reference created on every render
const preRegisteredHandler = () => {
  if (currentOverlayRef.current) {
    overlay.close(currentOverlayRef.current);
    return false;
  }
  return true;
};
```

**Important**: Using a ref is for accessing the latest value inside the function, not for stabilizing the function reference. Without `useCallback`, a new function is created on every render.

```
Time →

[T0] User clicks back button
     │
     ▼
[T1] popstateHandler_A called (state_A: isNavigationConfirmed = false)
     │
     ▼
[T2] Dialog shown, re-render occurs for some reason while waiting for user input
     │
     ▼
[T2.1] OverlayGuardHandler re-renders → preRegisteredHandler created as new function
     │
     ▼
[T2.2] Effect re-runs:
       ┌───────────────────────────────────────────────────────────┐
       │ cleanup: popstateHandler_A released                       │
       │ setup:   popstateHandler_B newly created                  │
       │          (state_B: isNavigationConfirmed = false)         │  ← New state!
       └───────────────────────────────────────────────────────────┘
     │
     ▼
[T3] User clicks "Leave"
     │
     ▼
[T4] state_A.isNavigationConfirmed = true set
     │  (but popstateHandler_A is already released!)
     │
     ▼
[T5] history.go(delta) called → URL changes
     │
     ▼
[T6] New popstate fired → popstateHandler_B called (currently registered handler)
     │
     ▼
[T7] state_B.isNavigationConfirmed === false → beforePopState returns false
     │
     ▼
[T8] URL is at previous page, but Next.js doesn't update page ❌
```

---

## Visual Comparison

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
│         ↑                              ↑                           │
│    Set on this state, but...     This state is false! ❌           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Why Did It Appear to Only Fail After Refresh?

In reality, **the bug existed regardless of refresh**.
The manifestation differed depending on React's rendering timing.

| Situation | React Mode | Re-render Handling | Result |
|-----------|------------|-------------------|--------|
| **After refresh** | Initial Mount | Synchronous, immediate | Effect re-runs immediately on re-render → state lost → **URL changes, page stays same** |
| **Without refresh** | Update Mode | Batching / deferred possible | Works or shows different symptoms like modal appearing twice depending on timing |

### Other Symptoms That Can Occur Without Refresh

1. **Modal shows twice**: Effect re-runs causing state reset → handler re-executes
2. **Works on second click**: First "Leave" fails, success on the modal that appears again
3. **Intermittent failure**: Works or fails randomly depending on re-render timing

---

## Solution

### 1. Memoize preRegisteredHandler with useCallback (Required)

```tsx
// web-back-navigation-handler-context.tsx
const OverlayGuardHandler = ({ handlerMap }: { handlerMap: Map<string, HandlerDef> }) => {
  const currentOverlayRef = useCurrentOverlayRef();

  // ✅ Maintain stable reference with useCallback
  // This prevents useInterceptPopState's effect from re-running unnecessarily
  const preRegisteredHandler = useCallback(() => {
    if (currentOverlayRef.current) {
      overlay.close(currentOverlayRef.current);
      return false;
    }
    return true;
  }, []); // currentOverlayRef is a ref, so no dependency needed

  useInterceptPopState({ handlerMap, preRegisteredHandler });

  return null;
};
```

### 2. useCurrentOverlayRef Pattern (for accessing latest value)

```tsx
/**
 * Wraps overlay state in a ref to maintain stable reference
 * 
 * Why needed:
 * - useCurrentOverlay() may return a new value on every render
 * - Putting this value directly in useCallback deps would recreate the function
 * - Using a ref maintains function reference while accessing latest value
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

## Why This Pattern Is Safe

1. **ref object itself is stable**: Same reference throughout component lifecycle
2. **ref.current update is in useEffect**: No side effects during render (React rules compliant)
3. **popstate occurs after user action**: Effect has already run, so latest value is guaranteed
4. **useCallback deps is empty array**: Function reference doesn't change, preventing effect re-run

---

## Core Principle

> When `preRegisteredHandler` changes:
>
> 1. **Effect re-runs** (because it's in deps)
> 2. **New `popstateHandler` closure created** (`createPopstateHandler` called)
> 3. **New `interceptionStateContext` created** (all state reset)
> 4. State set by previous async handler **only exists in previous closure**
> 5. New popstate checks **new closure's state** → `isNavigationConfirmed === false` → blocked
>
> **Therefore, maintaining stable reference with `useCallback(fn, [])` is essential.**

---

## Related Files

- `src/BackNavigationHandlerProvider.tsx` - Provider component
- `src/useInterceptPopState.ts` - effect deps includes `preRegisteredHandler`
- `src/useInterceptPopState.helper/interception-state.ts` - `isNavigationConfirmed` state management
- `example/src/pages/_app.tsx` - `useCallback` applied, `useCurrentOverlayRef` pattern usage example
