# Why This Library Exists

This document explains the fundamental problems with browser History API and Next.js Pages Router that this library solves.

---

## Table of Contents

1. [When You Need Back Navigation Control](#when-you-need-back-navigation-control)
2. [How Next.js Pages Router Handles Navigation](#how-nextjs-pages-router-handles-navigation)
3. [The Gap: What Next.js Doesn't Provide](#the-gap-what-nextjs-doesnt-provide)
4. [Problem 1: URL Restoration After Blocking](#problem-1-url-restoration-after-blocking)
5. [Problem 2: Detecting Back vs Forward Navigation](#problem-2-detecting-back-vs-forward-navigation)
6. [Problem 3: Refresh and Session Token Recovery](#problem-3-refresh-and-session-token-recovery)
7. [Summary](#summary)

---

## When You Need Back Navigation Control

In web applications, the browser back button doesn't always mean "go to the previous page." Sometimes it should mean something else:

### Use Case 1: Modal Dismissal

When a modal is open, users instinctively press the back button to close it—especially on mobile devices.

```
User opens modal → Presses back button → Expected: Modal closes
                                         Reality: Page navigates away!
```

Without intervention, pressing back navigates to the previous page, leaving the modal in a broken state.

### Use Case 2: Unsaved Changes Protection

Forms with unsaved data need protection against accidental navigation:

```
User edits form → Presses back button → Expected: "You have unsaved changes" dialog
                                        Reality: Data lost forever!
```

The user loses all their work without warning.

### Use Case 3: Multi-step Wizards

Complex flows (checkout, onboarding) need step-by-step navigation:

```
User on Step 3 → Presses back button → Expected: Go to Step 2
                                       Reality: Exit wizard entirely!
```

The wizard state is lost and the user must start over.

### The Common Thread

All these scenarios require **intercepting** the back button and **deciding** whether to:
- Block the navigation entirely
- Perform a custom action (close modal, show dialog)
- Allow the navigation to proceed

**So how do you do this in Next.js?**

---

## How Next.js Pages Router Handles Navigation

Let's analyze the actual Next.js source code to understand exactly what happens when users navigate.

> Source: [`packages/next/src/shared/lib/router/router.ts`](https://github.com/vercel/next.js/blob/canary/packages/next/src/shared/lib/router/router.ts)

### Step 1: Router Initialization

When Next.js initializes, the Router constructor registers a global `popstate` event listener:

```typescript
// packages/next/src/shared/lib/router/router.ts
constructor(...) {
  // ...
  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', this.onPopState)
  }
}
```

This is how Next.js intercepts browser back/forward button clicks.

### Step 2: The onPopState Handler

When the browser's back/forward button is pressed, the `onPopState` handler is called:

```typescript
// packages/next/src/shared/lib/router/router.ts (simplified)
onPopState = (e: PopStateEvent): void => {
  const state = e.state as HistoryState

  // Handle edge cases
  if (!state) {
    // Hash change or old browser (Safari < 8, Chrome < 34)
    this.changeState('replaceState', ...)
    return
  }
  if (state.__NA) {
    // App Router entry - full reload
    window.location.reload()
    return
  }
  if (!state.__N) {
    // Not a Next.js managed state - ignore
    return
  }

  // Safari fires popstate when reopening browser - skip duplicate
  if (isFirstPopStateEvent && this.locale === state.options.locale && 
      state.as === this.asPath) {
    return
  }

  // ★ THE CRITICAL PART ★
  // _bps is the callback registered via router.beforePopState()
  // If it returns false, just return - do nothing else.
  if (this._bps && !this._bps(state)) {
    return  // ← Next.js does NOTHING. URL is already changed!
  }

  // Normal case: proceed with route change
  this.change('replaceState', url, as, options, forcedScroll)
}
```

### Step 3: The beforePopState API

The public API `router.beforePopState()` simply stores a callback in `this._bps`:

```typescript
// Usage
router.beforePopState(({ url, as, options }) => {
  if (hasUnsavedChanges) {
    return false  // Block navigation
  }
  return true
})
```

When this callback returns `false`, look at what happens in the handler:

```typescript
if (this._bps && !this._bps(state)) {
  return  // ← Just returns. That's ALL it does.
}
```

Next.js simply **exits the handler**. It does NOT:
- Restore the URL
- Fire any events  
- Update any state
- Call `history.go()` or `history.pushState()`

The source code comment says it all:
> *"If the downstream application returns falsy, return. They will then be responsible for handling the event."*

### The Timeline: Why URL Mismatch Happens

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User clicks back button                                      │
│    URL: /page-b → /page-a  (Browser changes URL IMMEDIATELY)    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Browser fires popstate event                                 │
│    e.state = { __N: true, url: '/page-a', as: '/page-a', ... }  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Next.js onPopState handler runs                              │
│    if (this._bps && !this._bps(state)) { return }               │
│                                                                 │
│    Your callback returns false → Handler exits early            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Result                                                       │
│    - URL bar shows: /page-a  ← WRONG!                           │
│    - React renders: /page-b  ← Still on old page                │
│    - User sees: Content for /page-b with URL of /page-a         │
└─────────────────────────────────────────────────────────────────┘
```

**The fundamental problem**: The browser changes the URL *before* any JavaScript runs. By the time `beforePopState` is called, the URL has already changed. Next.js gives you a way to cancel its internal state update, but leaves URL restoration entirely to you.

---

## The Gap: What Next.js Doesn't Provide

The official API has a critical gap:

| What You Need | What Next.js Provides |
|---------------|----------------------|
| Block back navigation | `beforePopState(() => false)` ✅ |
| Restore URL after blocking | ❌ **Not provided** |
| Detect back vs forward | ❌ **Not provided** |
| Handle page refresh | ❌ **Not provided** |
| Handle external domain entry | ❌ **Not provided** |

The documentation says *"you'll be responsible for handling it"*—but doesn't explain how. That's what this library provides.

Let's examine each problem and its solution.

---

## Problem 1: URL Restoration After Blocking

### What happens when user clicks back button?

When the back button is clicked in Next.js Pages Router:

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

### The Core Issue: beforePopState Cannot Restore URL

Even when `beforePopState` returns `false`:

| State | Value |
|-------|-------|
| URL bar | `/posts` (changed!) |
| React state | `/posts/123` |
| Result | **URL and React state mismatch!** |

**Root cause**: The browser changes the URL before any JavaScript runs. By the time `beforePopState` is called, the URL has already changed.

### Solution: URL Restoration Mechanism

We restore the URL using `history.go()`:

**Token Mismatch (genuine session boundary — external entry, no metadata):**
```typescript
window.history.go(1);  // Always 1 step forward
```

**Internal navigation (including normal back navigation after refresh):**
```typescript
const delta = nextIndex - currentIndex;  // e.g., -1, -2, -3
window.history.go(-delta);  // Restore by calculated amount
```

Why different approaches?
- Token mismatch: Genuine session boundary — always exactly 1 step back from current position
- Internal: User might jump multiple steps (browser history dropdown); after refresh, the refreshed entry rejoins its original session so index-based calculation applies here too

---

## Problem 2: Detecting Back vs Forward Navigation

### We Need to Know the Direction

The `popstate` event fires for **both** back and forward navigation. But we only want to block **back** navigation.

| Navigation | Should Block? |
|------------|---------------|
| Back button | Yes |
| Forward button | No |

To distinguish them, we need to know the **current position (index)** in the history stack:

```
History Stack:
[0] /
[1] /posts
[2] /posts/123  ← current (index: 2)

Back: nextIndex (1) < currentIndex (2) → Block
Forward: nextIndex (3) > currentIndex (2) → Allow
```

### Navigation API Exists But Has Poor Support

Modern browsers have Navigation API with index:

```typescript
navigation.currentEntry.index  // Current history index
```

But browser support is limited:

| Browser | Navigation API |
|---------|----------------|
| Chrome | Supported (102+) |
| Edge | Supported (102+) |
| Safari | Supported (26.4+) |
| Firefox | Supported (149+) |

Global support is ~87.8% ([caniuse](https://caniuse.com/mdn-api_navigation)), but Safari/Firefox only shipped recently — a large share of real-world users still run older versions without the API. A fallback that works on every browser is still required.

### Solution: Index Tracking System

We patch `history.pushState` to inject index into every state:

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

On popstate, we calculate delta to determine direction:

```typescript
const nextIndex = Number(nextState.__next_navigation_stack_index) || 0;
const delta = nextIndex - renderedStateRef.current.index;

if (delta < 0) {
  // Back navigation → Block
} else {
  // Forward navigation → Allow
}
```

Because the session token is now recovered at module-evaluation time after a refresh (see Problem 3), the refreshed entry rejoins its original session and this same index-based delta calculation correctly distinguishes forward from back navigation after a refresh too.

---

## Problem 3: Refresh and Session Token Recovery

### How the Token Is Recovered After Refresh

After a refresh, the library recovers the previous session token by reading `history.state` at module-evaluation time — during bundle execution, before Next.js router hydration overwrites `history.state`. (The browser preserves the current entry's `history.state` across a reload until roughly the `load` event; Next.js overwrites it only later, during hydration, which is when the provider mounts — so a read at provider-mount time was too late, but a module-eval read still sees the old token.) Because the refreshed entry rejoins its original session, after-refresh navigation is tracked by index like normal navigation: forward is correctly detected as forward (delta > 0, allowed) and back as back (delta < 0, guarded).

This is implemented in `history-augmentation.ts`: `__next_session_token` and `__next_navigation_stack_index` are read from `history.state` at module-evaluation time, and `initializeHistoryStateSyncOnce()` restores `{token, index}` if captured, otherwise generates a fresh token for a genuine new session.

### The rAF + setTimeout Fallback for After-Refresh Back Navigation

After a refresh, Next.js does not invoke `beforePopState` for the library's synthetic `history.go()` restore, so the normal `delta === 0` follow-up popstate never arrives. The internal-back path therefore also schedules a `requestAnimationFrame` + `setTimeout` fallback so the handler still runs, guarded by a flag for exactly-once execution.

### Solution: Token-Based Session Boundary Detection (for Genuine Boundaries)

Token injection still happens alongside index:

```typescript
const modifiedState = {
  ...state,
  __next_navigation_stack_index: renderedStateRef.current.index,
  __next_session_token: renderedStateRef.current.token,
};
```

On popstate, the token-mismatch check now handles only genuine session boundaries — entries that carry no metadata, or a token from a different session:

```typescript
const token = nextState.__next_session_token;

const isTokenMismatch =
  !token ||  // Missing session metadata (first visit, pre-library entries)
  token !== renderedStateRef.current.token;  // Genuine different session
```

The token-mismatch path still exists, but it is no longer the normal after-refresh path. It now handles only genuine session boundaries — entries that carry no metadata, or a token from a different session.

### Scenario Examples

**After refresh (token recovered — same session):**
```
module-eval reads: history.state.__next_session_token = "abc123"
                   history.state.__next_navigation_stack_index = 2
initializeHistoryStateSyncOnce() restores token = "abc123", index = 2
→ Refreshed entry rejoins session "abc123"
→ Navigation tracked by index (forward/back correctly detected)
```

**First visit or genuine new session (no metadata):**
```
module-eval reads: history.state has no __next_session_token
initializeHistoryStateSyncOnce() generates fresh token = "xyz789"
→ Older entries without token → isTokenMismatch = true → history.go(1)
```

**Normal internal navigation:**
```
currentToken = "abc123", nextState.token = "abc123"
→ Token matches ✓ Normal index-based handling.
```

### Important Scope Limit: External Domain Back Is Not Intercepted

When the user leaves your site for another domain, your page is unloaded. That
navigation is outside this library's control, and there is no `popstate` event
for us to intercept while your app is gone.

---

## Summary

| Problem | Cause | Solution |
|---------|-------|----------|
| **URL Restoration** | Browser changes URL before JS runs | `history.go()` to restore URL |
| **Direction Detection** | popstate fires for both back/forward | Patch pushState to inject index, calculate delta |
| **Session Boundary Detection** | History entries from before the library was loaded carry no metadata or a different session token | Recover session token at module-eval time (before Next.js hydration overwrites `history.state`); token-mismatch path handles only genuine boundaries |

Next.js Pages Router provides `beforePopState` to intercept navigation, but leaves the hard problems to you. This library solves them.

---

## Related Files

| File | Purpose |
|------|---------|
| `src/useInterceptPopState.helper/history-augmentation.ts` | History API patching (index/token injection) |
| `src/useInterceptPopState.ts` | Popstate interception and handling |
