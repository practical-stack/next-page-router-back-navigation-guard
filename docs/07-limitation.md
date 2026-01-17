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

## 2. History Issues When Using router.push/replace Inside Handler (Chrome Only)

When calling `router.push()` or `router.replace()` inside a handler, **the history stack gets corrupted in Chrome only**. Safari works correctly.

### Problem Scenario

```
1. External Page → Page A → Page B (normal navigation)
2. Press back on Page B
3. Handler redirects to Home page using router.push('/home')
4. Press back on Home page
5. Expected: Navigate to Page B or Page A
6. Actual: Exits to external page (leaves the app)
```

#### Expected Behavior (Safari)
https://github.com/user-attachments/assets/7bca4852-ec3f-4da1-950a-c8fac1b25d45

#### Issue (Chrome)
https://github.com/user-attachments/assets/dd8b6d81-0c7b-499b-bfb3-525f634fdaa7

### Affected Code

```typescript
useRegisterBackNavigationHandler(
  async () => {
    router.push('/home'); // History gets corrupted after redirect
    return false;
  },
  { once: true }
);
```

### Browser Behavior

| Browser | Issue Present |
|---------|---------------|
| Chrome (Windows) | Yes |
| Mac Chrome | Yes |
| Android Chrome | Unconfirmed |
| Mac Safari | Works correctly |
| iOS Safari | Works correctly |

> **Note**: This issue does not occur in Safari. It has only been confirmed in Chrome-based browsers.

### Acceptable Use Cases

This limitation is acceptable when using it for **redirecting to a specific page on back navigation**:

```typescript
// Funnel exit prevention: redirect to home on back navigation
useRegisterBackNavigationHandler(
  async () => {
    router.push('/home');
    return false;
  },
  { once: true }
);
```

The intent of this pattern is to **prevent users from going back to previous funnel steps**. Even if pressing back on the redirected page exits the app, the original purpose (preventing access to a specific page via back navigation) is achieved, so this limitation can be accepted.

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
| router.push/replace in handler | History corruption (Chrome only, Safari OK) | Accept limitation for funnel exit prevention purposes |
| Samsung Internet "Block backward redirections" | Cannot block back navigation | Fallback to unmount overlays |
