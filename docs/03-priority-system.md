# Handler Priority System

This document explains the priority system and conflict detection when multiple BackNavigationHandlers are registered.

---

## Table of Contents

1. [Why Multiple Handlers?](#why-multiple-handlers)
2. [Priority Hierarchy](#priority-hierarchy)
3. [Conflict Detection](#conflict-detection)
4. [Handler Options](#handler-options)
5. [Execution Flow](#execution-flow)

---

## Why Multiple Handlers?

### Simple Apps: One Handler is Enough

```tsx
useRegisterBackNavigationHandler(() => {
  return window.confirm("You have unsaved changes. Leave anyway?");
});
```

### Complex Apps: Multiple Handlers Needed

In real apps, multiple components may independently handle back navigation:

```
App
├── GlobalModalProvider
│   └── Handler: Close modal if open
├── Page
│   └── Handler: Show confirm if form dirty
└── BottomSheet
    └── Handler: Close sheet if open
```

**Problem**: Which handler should execute first?

---

## Priority Hierarchy

Handlers execute in this order (highest to lowest priority):

| Priority | Type | Description |
|----------|------|-------------|
| 1st | `preRegisteredHandler` | Set at Provider level |
| 2nd | `override: true` handlers | Sorted by `overridePriority` (0 → 1 → 2 → 3) |
| 3rd | `override: false` handlers | Default handlers (only one allowed) |

### preRegisteredHandler

A global handler set at the Provider level. Always executes first.

```tsx
<BackNavigationHandlerProvider
  preRegisteredHandler={() => {
    if (globalModal.isOpen) {
      globalModal.close();
      return false;  // Block navigation
    }
    return true;  // Proceed to next handler
  }}
>
  <App />
</BackNavigationHandlerProvider>
```

**Use case**: Logic that must always be checked first (global modals, loading states).

### override Option

Default `override: false` means "normal handler". Only **one** normal handler can be registered.

```tsx
// Normal handler (override: false is default)
useRegisterBackNavigationHandler(() => {
  return window.confirm("Leave page?");
});
```

Setting `override: true` allows additional handlers that execute before normal handlers.

```tsx
// Override handler - executes before normal handlers
useRegisterBackNavigationHandler(
  () => {
    if (bottomSheet.isOpen) {
      bottomSheet.close();
      return false;
    }
    return true;
  },
  { override: true }
);
```

### overridePriority

Determines order when multiple `override: true` handlers exist.

```typescript
overridePriority: 0 | 1 | 2 | 3  // Lower = higher priority (default: 1)
```

```tsx
// Priority 0: Executes first
useRegisterBackNavigationHandler(
  () => handleCriticalAction(),
  { override: true, overridePriority: 0 }
);

// Priority 1: Executes second (default)
useRegisterBackNavigationHandler(
  () => handleNormalOverride(),
  { override: true }
);

// Priority 2: Executes third
useRegisterBackNavigationHandler(
  () => handleLowPriority(),
  { override: true, overridePriority: 2 }
);
```

---

## Conflict Detection

The library detects invalid handler combinations and logs warnings.

### Conflict 1: Two Normal Handlers

```tsx
// ComponentA
useRegisterBackNavigationHandler(() => confirm("A"));

// ComponentB (same page)
useRegisterBackNavigationHandler(() => confirm("B"));
// → Warning: Another non-override handler already exists
```

**Solution**: Use `override: true` for additional handlers.

### Conflict 2: Same Priority Override Handlers

```tsx
useRegisterBackNavigationHandler(() => confirm("A"), { override: true });

useRegisterBackNavigationHandler(() => confirm("B"), { override: true });
// → Warning: Handler with priority 1 already exists
```

**Solution**: Use different `overridePriority` values.

### Valid Combinations

```tsx
// ✅ One normal handler
useRegisterBackNavigationHandler(() => confirm("A"));

// ✅ Add with override
useRegisterBackNavigationHandler(() => confirm("B"), { override: true });

// ✅ Different priorities
useRegisterBackNavigationHandler(() => confirm("C"), {
  override: true,
  overridePriority: 0
});
```

---

## Handler Options

### enable Option

Allows conditional registration while respecting React Hook rules.

```tsx
// ❌ Wrong: Hook called conditionally
if (isFormDirty) {
  useRegisterBackNavigationHandler(() => confirm("Leave?"));
}

// ✅ Correct: Always call, use enable for condition
useRegisterBackNavigationHandler(
  () => confirm("You have unsaved changes. Leave anyway?"),
  { enable: isFormDirty }
);
```

**Use cases**:
- Form dirty state
- Editor open state
- Loading state

### once Option

Handler auto-unregisters after one execution, **regardless of return value**.

```tsx
useRegisterBackNavigationHandler(
  () => {
    console.log("Only executed on first back navigation");
    return true;
  },
  { once: true }
);
```

**Important**: The handler is removed immediately upon execution, not upon allowing navigation.

| Scenario | Handler returns | Handler after execution |
|----------|-----------------|-------------------------|
| User confirms | `true` (allow) | Removed |
| User cancels | `false` (block) | Removed |

**Example with dialog**:

```tsx
useRegisterBackNavigationHandler(
  () => {
    // Shows confirm dialog
    // Handler is ALREADY REMOVED when this function starts executing
    return window.confirm("Leave page?");
  },
  { once: true }
);
```

Scenario:
1. First back → handler shows dialog → user clicks "Cancel" → handler removed, navigation blocked
2. Second back → no handler exists → navigation proceeds (or preRegisteredHandler runs if registered)

### Combining Options

```tsx
const [showOnboarding, setShowOnboarding] = useState(true);

useRegisterBackNavigationHandler(
  () => {
    const confirmed = window.confirm("Skip onboarding?");
    if (confirmed) setShowOnboarding(false);
    return confirmed;
  },
  { once: true, enable: showOnboarding }
);
```

---

## Execution Flow

```
Back Navigation Triggered
        │
        ▼
┌─────────────────────────────────────┐
│ 1. Execute preRegisteredHandler     │
│    → Block if returns false         │
└─────────────────────────────────────┘
        │ returns true
        ▼
┌─────────────────────────────────────┐
│ 2. Sort handlers                    │
│    - override: true (by priority)   │
│    - override: false                │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│ 3. Delete handler if once: true     │
│    (removed BEFORE execution)       │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│ 4. Execute first handler            │
│    → Block if returns false         │
└─────────────────────────────────────┘
        │ returns true
        ▼
┌─────────────────────────────────────┐
│ 5. Allow navigation                 │
└─────────────────────────────────────┘
```

### Real-World Example

```tsx
// Provider level - Priority 1
<BackNavigationHandlerProvider
  preRegisteredHandler={() => {
    if (globalLoading) return false;
    return true;
  }}
>

// ComponentA - Priority 2 (override: true, priority: 0)
useRegisterBackNavigationHandler(
  () => {
    if (criticalModal.isOpen) {
      criticalModal.close();
      return false;
    }
    return true;
  },
  { override: true, overridePriority: 0 }
);

// ComponentB - Priority 3 (override: true, priority: 1)
useRegisterBackNavigationHandler(
  () => {
    if (bottomSheet.isOpen) {
      bottomSheet.close();
      return false;
    }
    return true;
  },
  { override: true }
);

// ComponentC - Priority 4 (override: false)
useRegisterBackNavigationHandler(() => {
  return window.confirm("Leave page?");
});
```

**Execution Order**:
1. Check `globalLoading`
2. Check `criticalModal`
3. Check `bottomSheet`
4. Show confirm dialog

If `false` is returned at any step, navigation is blocked.

---

## Summary

| Concept | Description |
|---------|-------------|
| **preRegisteredHandler** | Provider-level, highest priority |
| **override: false** | Normal handler, only one allowed |
| **override: true** | Priority handler, multiple allowed |
| **overridePriority** | 0-3, lower = higher priority |
| **Conflict Detection** | console.warn on invalid combinations |
| **enable** | Conditional registration |
| **once** | Auto-unregister after execution |
