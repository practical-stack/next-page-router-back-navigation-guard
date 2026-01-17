# next-page-router-back-navigation-guard Documentation

This documentation explains the design, implementation, and usage of the `next-page-router-back-navigation-guard` library.

---

## Reading Guide

The documents are organized to tell a complete story. Read in order for best understanding.

### For Users

| # | Document | Description |
|---|----------|-------------|
| 01 | [Why This Library](./01-why-this-library.md) | **Start here.** The core problems and solutions (URL restoration, index tracking, session tokens). |
| 02 | [Blocking Scenarios](./02-blocking-scenarios.md) | All back navigation scenarios with flow diagrams. |
| 03 | [Priority System](./03-priority-system.md) | Handler options: `override`, `enable`, `once`, conflict detection. |
| 07 | [Limitations](./07-limitation.md) | Known limitations and non-working cases. |

### For Contributors

| # | Document | Description |
|---|----------|-------------|
| 04 | [Design Evolution](./04-design-evolution.md) | Why we moved from useEffect order to explicit priority system. |
| 05 | [Internal Implementation](./05-internal-implementation.md) | Map structure, useState pattern, useId() for keys. |
| 06 | [preRegisteredHandler Reference Stability](./06-preregistered-handler-reference-stability.md) | Why `preRegisteredHandler` must maintain stable reference (useCurrentOverlayRef pattern). |

---

## Quick Reference

### API Options

| Option | Default | Description |
|--------|---------|-------------|
| `override` | `false` | Priority handler (executes before normal handlers) |
| `overridePriority` | `1` | Priority level 0-3 (lower = higher priority) |
| `enable` | `true` | Conditional registration |
| `once` | `false` | Auto-unregister after execution |

### Source Files

| File | Purpose |
|------|---------|
| `src/useRegisterBackNavigationHandler.ts` | Handler registration hook |
| `src/useInterceptPopState.ts` | Popstate interception (core) |
| `src/BackNavigationHandlerProvider.tsx` | Provider component |

#### Helper Modules (`src/useInterceptPopState.helper/`)

| File | Purpose |
|------|---------|
| `history-augmentation.ts` | History API patching (index/token injection) |
| `interception-state.ts` | Interception flags (`isRestoringUrl`, `isNavigationConfirmed`, etc.) |
| `rendered-state-context.ts` | Track current historyIndex and sessionToken |
| `parse-history-state.ts` | Extract token/index from history.state |
| `handler-execution.ts` | Run handler chain and determine navigation |
| `sort-handlers.ts` | Priority-based handler sorting |
| `types.ts` | TypeScript types (`RenderedState`, `NextHistoryState`) |

---

## Translations

- [한국어 (Korean)](./README.ko.md)
