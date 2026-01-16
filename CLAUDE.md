# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

next-page-router-back-navigation-guard is a React/Next.js library that provides navigation guards to prevent back navigation when there are unsaved changes. Supports Next.js Pages Router only.

## Commands

```bash
# Build library
pnpm build

# Watch mode development
pnpm watch

# E2E tests (primary testing mechanism - no unit tests)
pnpm e2e                 # Run all tests
pnpm e2e:ui              # Run with Playwright UI
pnpm e2e:install         # Install Playwright browsers

# Verify package exports
pnpm check:packaging

# Example app (from example/ directory)
pnpm dev                 # Start dev server
pnpm build && pnpm start # Production build
pnpm lint                # Next.js linter
```

## Architecture

### Navigation Interception Strategy

The library intercepts **back navigation only** through:
1. **History popstate** (`useInterceptPopState.ts`) - Browser back button and `router.back()`
2. **History augmentation** (`useInterceptPopState.helper/history-augmentation.ts`) - Patches History API to track index

**Not intercepted** (by design):
- `router.push()`, `router.replace()`, `<Link>` clicks - pass through unchanged
- `beforeunload` (tab close/reload) - not blocked by popstate handlers

### Component Hierarchy

```
BackNavigationHandlerProvider (root wrapper)
├── BackNavigationHandlerContext (handler map via React Context)
└── useInterceptPopState (popstate interception - core logic)
    └── useInterceptPopState.helper/
        ├── history-augmentation.ts (History API patching)
        ├── interception-state.ts (isRestoringUrl, isNavigationConfirmed flags)
        ├── rendered-state-context.ts (historyIndex, sessionToken state)
        ├── parse-history-state.ts (extract token/index from history.state)
        ├── handler-execution.ts (run handler chain)
        ├── sort-handlers.ts (priority-based sorting)
        └── types.ts (RenderedState, NextHistoryState)
```

### Key Types (src/@shared/types.ts)

- `BackNavigationParams` - Event info: `{ to }` (destination path)
- `BackNavigationCallback` - Internal: `(params) => boolean | Promise<boolean>`
- `HandlerDef` - Internal handler structure: `{ id, callback, override, overridePriority, once }`
- `BackNavigationHandler` - Public handler type: `() => boolean`

### Public API (src/index.ts)

Only three exports: `useRegisterBackNavigationHandler`, `BackNavigationHandlerProvider`, `BackNavigationHandler` type

## Design Decisions

### Why This Library Exists

Next.js has no official API to cancel navigation. Community discussions (#9662, #47020) show endless "this worked for me" / "doesn't work when X" cycles. This library provides a complete solution for back navigation.

### Navigation Scope

| Navigation Type | Intercepted? | Notes |
|-----------------|--------------|-------|
| Browser back button | Yes | Core use case |
| `router.back()` | Yes | Triggers popstate |
| Browser forward button | No | Allowed by design |
| `router.push/replace` | No | Not back navigation |
| `<Link>` clicks | No | Uses router.push internally |
| Tab close/reload | No | Use `beforeunload` directly if needed |

### The Core Hack

**Patch history.pushState to track index** (`history-augmentation.ts`)
- Problem: History API has no index property; can't know back/forward delta
- Navigation API has `navigation.currentEntry.index` but Safari/Firefox don't support it
- Solution: Patch `history.pushState()` to inject custom metadata into `history.state`:
  - `__next_navigation_stack_index` - Position in history stack
  - `__next_session_token` - Unique identifier for current session
- On popstate: calculate `historyIndexDelta = nextHistoryIndex - currentHistoryIndex`
- If delta < 0 (back navigation): restore URL with `history.go(-delta)`, run handler
- If delta > 0 (forward navigation): allow without blocking

### Token-based Session Identification

Session token (`sessionToken`) in `history.state` identifies the current session:
- Token mismatch (refresh, external domain entry): use `history.go(1)` to restore
- Token match (normal back navigation): use `history.go(-delta)` to restore

### Pages Router Implementation

Uses `router.beforePopState(() => false)` to suppress Next.js state change, then restores URL and runs handlers.

### Async History Navigation (MDN Recommendation)

`history.go()`, `history.back()`, and `history.forward()` are **asynchronous** methods.

> "This method is asynchronous. Add a listener for the popstate event in order to determine when the navigation has completed."
> — [MDN Web Docs: History.go()](https://developer.mozilla.org/en-US/docs/Web/API/History/go)

**Implementation approach:**

When back navigation is detected:
1. Set `pendingHandlerExecution = true` and store `pendingHistoryIndexDelta`
2. Call `history.go(-delta)` to restore URL
3. Return `false` to block Next.js navigation
4. When popstate fires with `delta = 0`, the restoration is complete
5. **Then** run the handler (which may call `router.push()`)

This ensures `history.go()` completes before handlers execute, preventing history stack corruption when handlers navigate to different pages.

## Testing

E2E tests in `e2e/navigation-guard.spec.ts` test core scenarios:
1. Browser back button navigation guard
2. `router.back()` navigation guard
3. **After refresh (token mismatch)** - Tests navigation guard behavior after page reload

### Firefox-specific Configuration

Firefox requires special Playwright configuration due to a known bug where `page.goBack()` doesn't trigger popstate events after `page.reload()`:

```typescript
// playwright.config.ts
{
  name: "firefox",
  use: {
    ...devices["Desktop Firefox"],
    launchOptions: {
      firefoxUserPrefs: {
        "fission.webContentIsolationStrategy": 1,  // Fix for goBack after reload
      },
    },
  },
}
```

Reference: https://github.com/microsoft/playwright/issues/23210

CI matrix tests against Next.js versions 14.0 through 16.0.
