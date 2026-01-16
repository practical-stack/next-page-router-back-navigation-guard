# Blocking Scenarios

This document details all back navigation blocking scenarios handled by `next-page-router-back-navigation-guard`.

---

## Table of Contents

1. [Core Mechanism](#core-mechanism)
2. [Scenario 1: Normal Back Navigation](#scenario-1-normal-back-navigation)
3. [Scenario 2: Forward Navigation](#scenario-2-forward-navigation)
4. [Scenario 3: Multi-Step History Jump](#scenario-3-multi-step-history-jump)
5. [Scenario 4: Token Mismatch](#scenario-4-token-mismatch)
6. [Scenario 5: router.back()](#scenario-5-routerback)
7. [Internal Handling Scenarios](#internal-handling-scenarios)
8. [Complete Flow Diagram](#complete-flow-diagram)

---

## Core Mechanism

### History API Patching

The browser's History API doesn't provide a current position `index`. We patch `pushState` and `replaceState` to inject metadata:

```typescript
{
  __next_session_token: string,          // Session identifier
  __next_navigation_stack_index: number  // History stack position
}
```

### Popstate Interception

We use Next.js Pages Router's `beforePopState` callback to intercept back/forward navigation.

---

## Scenario 1: Normal Back Navigation

**Situation**: Page1 → Page2, then back button clicked

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

| Item | Value |
|------|-------|
| `to` | `/page1` |
| Block condition | Handler callback returns `false` |

---

## Scenario 2: Forward Navigation

**Situation**: Page1 ← Page2 (after back), then forward button clicked

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

**Note**: Forward navigation (delta > 0) is always allowed without blocking.

---

## Scenario 3: Multi-Step History Jump

**Situation**: Page1 → Page2 → Page3 → Page4, user selects Page1 directly from browser history menu

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

This happens when:
1. User long-presses/right-clicks back button → selects from history list
2. Code calls `history.go(-3)`
3. Browser extensions manipulate history

---

## Scenario 4: Token Mismatch

Covers: **Page refresh** and **External domain entry**

**Situation A**: Our site → Google → Back to our site
**Situation B**: Page refresh then back button

```
Back button clicked
    │
    ▼
popstate event fired
    │
    ▼
isAllowingNavigation flag check
    │
    ├── true → Allow navigation (handler already confirmed)
    │          Clear flag, update token/index, return true
    │
    └── false → Continue to token mismatch check
          │
          ▼
    isTokenMismatch = true detected
    (token missing or mismatched with current session)
          │
          ▼
    URL restoration needed before handler callback
          │
          ▼
    isRestoringFromTokenMismatch = true
          │
          ▼
    history.go(1) called → URL restored (forward)
          │
          ▼
    setTimeout: async handler callback execution
          │
          ├── Cancel (handler returns false)
          │     └→ Stay on current page
          │
          └── OK (handler returns true)
                └→ Set new token/index
                └→ isAllowingNavigation = true  ← Critical: set BEFORE back()
                └→ window.history.back() re-called
                └→ Next popstate sees isAllowingNavigation=true
                └→ Navigate to previous page
```

**URL Restoration Strategy**:
- At popstate, `window.location.href` is already changed to destination
- Using `pushState(state, "", window.location.href)` would push wrong URL
- Instead, use `history.go(1)` to go forward (since we came from back)

**Token Mismatch Detection**:
- `history.state` has no `__next_session_token`
- Or token doesn't match current session (regenerated after refresh)

**isAllowingNavigation Flag**:
- When handler confirms navigation (returns true), we call `history.back()`
- This triggers another popstate event, which would again detect token mismatch
- The `isAllowingNavigation` flag ensures this subsequent popstate is allowed through
- **Critical**: Flag must be set BEFORE calling `history.back()`, not after

---

## Scenario 5: router.back()

**Situation**: Code calls `router.back()`

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

## Internal Handling Scenarios

### Scenario 6: Delta is 0 (Restoration Popstate)

After blocking, `history.go(-delta)` triggers another popstate. To prevent infinite loops, we ignore events where delta is 0.

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

### Scenario 7: Token Mismatch Restoration Popstate

When blocking token mismatch, `history.go(1)` triggers another popstate. We use `isRestoringFromTokenMismatch` flag to ignore it.

```
Token Mismatch detected → history.go(1) called
    │
    ▼
isRestoringFromTokenMismatch = true
    │
    ▼
popstate re-fired (by go(1))
    │
    ▼
Check isRestoringFromTokenMismatch
    │
    ▼
If true → Clear flag and ignore event
```

### Scenario 8: Once Handler After Refresh (Empty HandlerMap with preRegisteredHandler)

When a `once: true` handler is deleted after execution, subsequent back navigations may have no handlers in the map but still need to run `preRegisteredHandler`.

```
Page refresh with once: true handler
    │
    ▼
First back → handler runs, shows dialog, blocks
    │         handler deleted (once: true)
    │
    ▼
Second back → Token mismatch, handlerMap is EMPTY
    │
    ▼
preRegisteredHandler runs (closes modal) → blocks
    │
    ▼
URL restoration: history.go(1) ← CRITICAL!
    │
    ▼
Third back → Token mismatch, no handlers, no overlay
    │
    ▼
Allow navigation → Navigate to previous page
```

**Why URL Restoration is Critical**:

Without `history.go(1)` in step 2:
- Browser URL changes to previous page (popstate already fired)
- But we return `false`, so Next.js stays on current page
- Browser URL and Next.js state are now **desynchronized**
- Third back tries to go before the first history entry → `about:blank`

With `history.go(1)`:
- URL is restored to current page after preRegisteredHandler blocks
- Browser and Next.js stay synchronized
- Third back correctly navigates to the previous page

---

## Complete Flow Diagram

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
                    │ isAllowingNavigation?    │  ← Check FIRST
                    +--------------------------+
                         │              │
                        YES            NO
                         │              │
                         ▼              ▼
                  +----------+  +--------------------------+
                  │ Clear    │  │ Token Mismatch?          │
                  │ flag,    │  │ (token missing/mismatch) │
                  │ Allow    │  +--------------------------+
                  +----------+       │              │
                                    YES            NO
                                     │              │
                                     ▼              ▼
                   +-------------------------+  +--------------+
                   │ isRestoringFromToken    │  │ delta === 0? │
                   │ Mismatch flag?          │  +--------------+
                   +-------------------------+       │      │
                          │          │             YES     NO
                         YES        NO              │       │
                          │          │              ▼       ▼
                          ▼          ▼       +---------+  +--------------+
                   +----------+  +--------+  │ Ignore  │  │ delta > 0?   │
                   │ Clear    │  │ handler│  +---------+  │ (forward)    │
                   │ flag,    │  │ exists?│               +--------------+
                   │ ignore   │  +--------+                    │      │
                   +----------+    │    │                    YES     NO
                                 YES   NO                     │       │
                                  │     │                     ▼       ▼
                          +----------+ +-----+         +---------+  +----------+
                          │ go(1)    │ │Allow│         │ Allow   │  │ handler  │
                          │ +set flag│ +-----+         +---------+  │ exists?  │
                          +----------+                              +----------+
                                │                                      │    │
                                ▼                                    YES   NO
                          +--------------+                             │     │
                          │ setTimeout   │                             ▼     ▼
                          │ handler call │                      +----------+ +-----+
                          +--------------+                      │ handler  │ │Allow│
                                │                               │ callback │ +-----+
                     +----------+----------+                    +----------+
                     │                     │                         │
                     ▼                     ▼              +----------+----------+
               +----------+         +----------+          │                     │
               │ Pass     │         │ Block    │          ▼                     ▼
               │ set flag │         │ stay     │    +----------+         +----------+
               │ back()   │         +----------+    │ Pass     │         │ Block    │
               +----------+                         │ set flag │         │ go(-delta)│
                                                    │ go(delta)│         │ restore  │
                                                    +----------+         +----------+
```

---

## Public API

```typescript
function useRegisterBackNavigationHandler(
  handler: BackNavigationHandler,
  options?: PartialBackNavigationHandlerOptions
): void;

// Handler type: true = allow, false = block
type BackNavigationHandler = () => boolean;

interface PartialBackNavigationHandlerOptions {
  once?: boolean;      // Auto-unregister after execution (default: false)
  enable?: boolean;    // Conditional registration (default: true)
  override?: boolean;  // Priority handler (default: false)
  overridePriority?: 0 | 1 | 2 | 3;  // Priority level (default: 1)
}
```

---

## Related Files

| File | Purpose |
|------|---------|
| `src/useInterceptPopState.ts` | Popstate interception (core logic) |
| `src/useRegisterBackNavigationHandler.ts` | Handler registration hook |
| `src/useInterceptPopState.helper/history-augmentation.ts` | History API patching |
| `src/BackNavigationHandlerProvider.tsx` | Provider component |
