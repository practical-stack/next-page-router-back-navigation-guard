# Limitations

This document describes the known limitations and non-working cases of `next-page-router-back-navigation-guard`.

---

## 1. Requires History Within the Same App

The library only works correctly **when there is browser history that can be navigated back within the same app**.

### Cases That Don't Work

| Case | Description |
|------|-------------|
| Direct entry from external source | Opening an overlay on the first page after coming from another app/domain, then pressing back |
| Opening in a new tab | When the page is the very first page in the browser |
| Direct access via bookmark/link | When accessing by directly entering URL or via bookmark |

https://github.com/user-attachments/assets/b819ea8f-ea66-49c1-96fe-226afa8854f6

### Why It Doesn't Work

This library uses `history.go(1)` to block back navigation. However, if there is no forward history, `history.go(1)` is ignored.

```
[External Site] → [Current Page (overlay open)]
                        ↑
                No forward history available when going back
```

### Why This Is a Fundamental Browser Limitation

This is a fundamental browser security limitation, not a library design flaw. When a user navigates to your app from an external source (e.g., clicking a link from another website or opening a URL directly), the entry page cannot block the back button because:

1. **The browser's session history is shared across different origins for navigation purposes** — JavaScript cannot access or manipulate history entries from other origins due to security restrictions.

2. **There is no reliable way to detect if a page is the "first page" entered from an external source** — While `history.length` can be checked, it's unreliable because coming from another website doesn't reset `history.length` to 1.

3. **JavaScript cannot clear session history or disable back/forward navigation** — As stated in MDN documentation: "There is no way to clear the session history or to disable the back/forward navigation from unprivileged code."

### References

- [MDN Web Docs - Window.history](https://developer.mozilla.org/en-US/docs/Web/API/Window/history): "For security reasons the History object doesn't allow the non-privileged code to access the URLs of other pages in the session history... There is no way to clear the session history or to disable the back/forward navigation from unprivileged code."
- The `history.length === 1` check is unreliable for detecting entry pages: "The check `history.length === 1` is definitely lame since if you come from another website the `history.length` won't be 1."

### Solution

To solve this case, the design would need to be changed to add history entries whenever an overlay is opened. (Outside the scope of current version)

---

## 2. Do NOT Use router.push/replace Inside Handler

**Using `router.push()` or `router.replace()` inside a handler is NOT supported and causes unpredictable behavior.**

### Why This Doesn't Work

When a handler calls `router.push('/new-page')`:

1. The new page (`/new-page`) typically has **no handler registered**
2. On the new page, pressing back triggers a **session token mismatch** (mixing old and new session history entries)
3. Without a handler on the new page, navigation is allowed to proceed
4. The browser navigates to an **unexpected history entry** from the previous session

### Problem Scenario (After Refresh)

```
1. Home → Page A (with handler)
2. Refresh Page A
3. Press back → Handler calls router.push('/new-page')
4. Arrive at /new-page (no handler)
5. Press back on /new-page
6. Expected: Navigate back to Page A
7. Actual: Navigates to Home (or other unexpected page)
```

This happens because:
- The history stack contains entries from **before** the refresh (old session token)
- `/new-page` has no handler to intercept the session token mismatch
- Navigation proceeds to an old session entry instead of the expected page

### Root Cause: Session Token Isolation

After a page refresh, the library generates a new session token. However:
- Old history entries still exist with the **previous session token**
- New pages added via `router.push()` have the **current session token**
- Pages without handlers cannot distinguish between these sessions
- This causes navigation to "leak" into old session history

### Browser Back Button vs router.back() API

An important distinction exists between how browsers handle the back button versus the `history.back()` API:

| Navigation Method | Behavior After Refresh |
|-------------------|------------------------|
| **Browser Back Button** | May skip entries or fail to trigger popstate (browser security policy) |
| **`router.back()` / `history.back()` API** | Respects all history entries (works normally) |

**Why this difference exists:**

Chrome and WebKit (Safari/iOS) implement a **History Manipulation Intervention** security feature:

> "The intervention makes the browser's back/forward buttons skip over pages that added history entries or redirected the user without ever getting a user activation."
> — [Chromium Documentation](https://chromium.googlesource.com/chromium/src/+/refs/heads/lkgr/docs/history_manipulation_intervention.md)

**Critically, this policy only affects browser UI buttons, not JavaScript APIs:**

> "It **only impacts the browser back/forward buttons** and not the `history.back()` or `history.forward()` APIs."

#### After Refresh Scenario

```
Before Refresh:
- All history entries created with user interaction ✅
- Browser treats them as "legitimate"

After Refresh:
- Current page is a "new document load"
- When library calls history.go(1) to restore URL, this happens inside
  a popstate handler (no user activation context)
- Browser may treat subsequent entries as "suspicious"
```

**Result:**
- `router.back()` button click → User activation → API call → Works ✅
- Browser back button → Security policy applied → May skip entries or fail ❌

### iOS Safari Specific Issues (iOS 16+)

iOS Safari has additional restrictions:

1. **Swipe-back gesture may not fire popstate** ([WebKit Bug 248303](https://bugs.webkit.org/show_bug.cgi?id=248303))
   > "popstate events are not fired for swipe-back gesture if the history entry was added without direct user interaction"

2. **popstate events lost during network requests** ([WebKit Bug 158489](https://bugs.webkit.org/show_bug.cgi?id=158489))
   - This issue does not occur in Chrome or Firefox

3. **Page cache behavior differs** ([WebKit Bug 145953](https://bugs.webkit.org/show_bug.cgi?id=145953))
   - After pushState + navigation away + back, Safari may request the page from server instead of restoring from cache

### Browser Behavior Summary

| Behavior | Chrome | Safari Desktop | iOS Safari |
|----------|--------|----------------|------------|
| Back button skips entries without user activation | ✅ | ✅ | ✅ |
| `history.back()` API respects all entries | ✅ | ✅ | ✅ |
| popstate on swipe-back (no user activation) | N/A | N/A | ❌ (iOS 16+) |
| popstate lost during network request | ❌ | ✅ | ✅ |
| `history.go()` is async | ✅ | ✅ | ✅ |

### Technical Background: history.go() is Asynchronous

MDN explicitly states:

> "This method is asynchronous. Add a listener for the popstate event in order to determine when the navigation has completed."
> — [MDN: History.go()](https://developer.mozilla.org/en-US/docs/Web/API/History/go)

This creates timing challenges:
```javascript
history.go(1);
// ❌ This runs BEFORE go(1) completes
doSomething();

// ✅ Correct: wait for popstate
window.addEventListener('popstate', () => {
  doSomething();
});
history.go(1);
```

### Recommended Patterns

Instead of routing inside handlers, use these patterns:

```typescript
// ✅ GOOD: Show confirmation dialog, let user decide
useRegisterBackNavigationHandler(() => {
  return window.confirm('You have unsaved changes. Leave anyway?');
});

// ✅ GOOD: Close overlay/modal and block navigation
useRegisterBackNavigationHandler(() => {
  if (isModalOpen) {
    closeModal();
    return false; // Block navigation, modal is closed
  }
  return true; // Allow navigation
});

// ❌ BAD: Route to another page inside handler
useRegisterBackNavigationHandler(() => {
  router.push('/home'); // DO NOT DO THIS
  return false;
});
```

### If You Must Redirect

If your use case absolutely requires redirecting on back navigation, be aware that:
- Subsequent back navigation from the redirected page may behave unexpectedly
- Browser back button may not work as expected after page refresh
- `router.back()` API may work while browser back button doesn't
- This is acceptable **only** if you don't care where users go after the redirect (e.g., funnel exit prevention where leaving the app is acceptable)

### References

- [Chromium History Manipulation Intervention](https://chromium.googlesource.com/chromium/src/+/refs/heads/lkgr/docs/history_manipulation_intervention.md)
- [WebKit Bug 248303: popstate not fired for swipe-back](https://bugs.webkit.org/show_bug.cgi?id=248303)
- [WebKit Bug 158489: popstate lost during network request](https://bugs.webkit.org/show_bug.cgi?id=158489)
- [MDN: History.go()](https://developer.mozilla.org/en-US/docs/Web/API/History/go)
- [WHATWG HTML Issue #7832: History traversal user gesture](https://github.com/whatwg/html/issues/7832)

---

## 3. Samsung Internet Browser "Block Backward Redirections" Feature

| Problem | Cause |
|---------|-------|
| Cannot block back navigation | "Block backward redirections" privacy setting blocks `history.go(1)` / `history.go(delta)` calls |

Samsung Internet Browser has a **"Block backward redirections"** feature in its privacy settings, which is **enabled by default**. When this feature is active, it blocks `history.go(1)` or `history.go(delta)` calls that this library uses for URL restoration, causing back navigation blocking to fail.

### Fallback Behavior

On Samsung Internet Browser, **instead of blocking back navigation, all overlays are unmounted** to prevent unintended errors.

> **Note**: The reason for using `unmountAll` instead of `close` for fallback is that overlay components remaining after back navigation could cause unintended errors.

### References

- [Samsung Internet 11.2 adds option to prevent sites that stop you from going back (XDA Developers)](https://www.xda-developers.com/samsung-internet-11213-adds-option-prevent-sites-stop-going-back/)
- [How to Block Backward redirections - Samsung Manual (TechBone)](https://www.techbone.net/samsung/user-manual/block-backward-redirections)

---

## Summary

| Limitation | Impact | Response |
|------------|--------|----------|
| Requires history within same app | Doesn't work on external entry | Notify user or implement separate handling |
| router.push/replace in handler | Unpredictable navigation, browser back button may fail after refresh while `router.back()` works | **Do not use** - show dialogs or close overlays instead |
| Samsung Internet "Block backward redirections" | Cannot block back navigation | Fallback to unmount overlays |

### Key Takeaway

The browser's History API has fundamental security restrictions that cannot be bypassed:

1. **Browser back button** applies security policies that may skip history entries
2. **`history.back()` API** respects all entries but requires user activation context
3. **After page refresh**, the library cannot reliably intercept navigation on pages without handlers
4. **iOS Safari** has additional restrictions on popstate events

**The safest pattern**: Use handlers only for confirmation dialogs or closing overlays. Do not perform routing inside handlers.
