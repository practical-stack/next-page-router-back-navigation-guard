# Design Evolution

This document explains the evolution of the handler priority system - from useEffect order-based to explicit override system.

---

## Table of Contents

1. [Overview](#overview)
2. [First Implementation: useEffect Order](#first-implementation-useeffect-order)
3. [The Problem: Re-render Priority Inversion](#the-problem-re-render-priority-inversion)
4. [Solution: Override + Priority System](#solution-override--priority-system)
5. [Key Lessons](#key-lessons)

---

## Overview

The back navigation handler system registers callbacks that execute when the back button is pressed. When multiple handlers are registered simultaneously, we need logic to determine **which handler executes first**.

---

## First Implementation: useEffect Order

### The Idea

React's `useEffect` executes **bottom-up** (children → parent). We leveraged this:

1. Deepest child's handler registers first
2. Execute first entry in Map
3. Result: Deepest component's handler runs first

```
useEffect execution order (Bottom-Up):
1. Child (deep) → Handler registered (Entry 1)
2. Parent (upper) → Handler registered (Entry 2)

On back button:
→ Execute Map's First Entry (Child Handler) ✓
```

### Why It Worked (Initially)

On initial mount, useEffect order matched component depth, so it worked as intended.

### The Initial Code

```typescript
const getFirstEntryOfMap = <K, V>(map: Map<K, V>): [K, V] | undefined => {
  const iterator = map.entries();
  const firstEntry = iterator.next();
  return !firstEntry.done ? firstEntry.value : undefined;
};

// Execute first entry
const handlerEntry = getFirstEntryOfMap(backNavigationHandlerMap);
if (handlerEntry) {
  const [handler, options] = handlerEntry;
  handler();
  if (options.once) {
    backNavigationHandlerMap.delete(handler);
  }
}
```

---

## The Problem: Re-render Priority Inversion

### The Bug: Nested Component Re-renders

When only the nested component re-renders:

```
STEP 1: Initial Mount (Normal)
┌──────────────────────────────────────────────┐
│ Map:                                         │
│   Entry 1: Nested Handler  ← FIRST           │
│   Entry 2: Parent Handler                    │
└──────────────────────────────────────────────┘

STEP 2: Nested Component Re-renders (state change)
┌──────────────────────────────────────────────┐
│ 1. Nested cleanup runs → Nested deleted      │
│ 2. Nested useEffect runs → Nested added      │
└──────────────────────────────────────────────┘

STEP 3: Map State After Re-render
┌──────────────────────────────────────────────┐
│ Map:                                         │
│   Entry 1: Parent Handler  ← NOW FIRST       │  ❌ WRONG!
│   Entry 2: Nested Handler  ← NOW LAST        │
└──────────────────────────────────────────────┘

Result: Parent Handler executes instead of Nested!
```

### Time Sequence

```
T0: Initial Mount
════════════════════════════════════════
│  Nested useEffect ──┬──► Map.set(Nested) → [Nested, Parent]
│  Parent useEffect ──┘

T1: Nested Re-renders (Parent unchanged)
════════════════════════════════════════
│  Nested cleanup ────► Map.delete(Nested) → [Parent]
│  Nested useEffect ──► Map.set(Nested)    → [Parent, Nested]
│                                            ↑
│                                       ORDER REVERSED!

T2: Back Button Pressed
════════════════════════════════════════
│  getFirstEntry() → Parent Handler (❌ Expected: Nested)
```

### Why Order-Based Approaches Fail

| Approach | Problem |
|----------|---------|
| First Entry Wins | Re-render changes entry order |
| Last Entry Wins | Same issue |
| Registration Timestamp | Re-render creates new timestamp |
| Component Tree Depth | React doesn't expose depth info |

**Conclusion**: Order-based approaches fail because useEffect cleanup/setup cycle on re-render **always** changes Map entry order unpredictably.

---

## Solution: Override + Priority System

### New Architecture

Instead of relying on registration order, use **explicit priority options**:

```typescript
interface HandlerOptions {
  once: boolean;           // Delete after execution
  enable: boolean;         // Activation flag
  override: boolean;       // Priority override flag
  overridePriority?: 0|1|2|3;  // Only when override=true
}
```

Execution priority:
1. `override: true` handlers (sorted by `overridePriority`, 0 = highest)
2. `override: false` handlers
3. Default back navigation

### Sorting Implementation

```typescript
function sortHandlersByPriority(handlers: HandlerDef[]): HandlerDef[] {
  return [...handlers].sort((a, b) => {
    // Override handlers come first
    if (a.override && !b.override) return -1;
    if (!a.override && b.override) return 1;

    // Among override handlers, sort by priority
    if (a.override && b.override) {
      return a.overridePriority - b.overridePriority;
    }

    // Non-override handlers maintain order
    return 0;
  });
}
```

### How It Solves the Problem

```
T0: Initial Mount
════════════════
Map: [
  (Nested, {override: true}),
  (Parent, {override: false})
]

T1: Nested Re-renders
═════════════════════
Map: [
  (Parent, {override: false}),  ← Entry order changed
  (Nested, {override: true})    ← BUT override still true!
]

T2: Back Button Pressed
══════════════════════════
sorted = sortByPriority(entries)
      = [(Nested, {override:true}), (Parent, {override:false})]

Execute: Nested Handler ✓ (CORRECT regardless of Map order!)
```

### Usage Example

```tsx
// ❌ Old: Order-dependent (unstable)
useRegisterBackNavigationHandler(() => {
  console.log('Nested handler');  // May not run after re-render!
  return false;
});

// ✅ New: Explicit priority
useRegisterBackNavigationHandler(
  () => {
    console.log('Nested handler');  // Always runs first!
    return false;
  },
  { override: true }
);
```

---

## Key Lessons

1. **Don't rely on useEffect order** - Re-render changes order
2. **Don't rely on Map/Array insertion order** - Delete/re-insert changes order
3. **Explicit priority is safer than implicit order** - `override` option makes intent clear
4. **Conflict detection prevents mistakes** - Warn on invalid combinations

---

## Summary

| Problem | Cause | Solution |
|---------|-------|----------|
| Priority inversion on re-render | useEffect cleanup/setup changes Map order | `override` option for explicit priority |
| Handler conflicts in multi-step flows | Multiple handlers, no guaranteed order | `override: true` for step handlers |
| Developer mistakes | Unclear which handler runs | Conflict detection with console.warn |

---

## Related Files

| File | Purpose |
|------|---------|
| `src/hooks/useRegisterBackNavigationHandler.ts` | Handler registration with options |
| `src/utils/sortHandlers.ts` | Priority-based sorting |
| `src/hooks/useInterceptPopState.ts` | Handler execution logic |
