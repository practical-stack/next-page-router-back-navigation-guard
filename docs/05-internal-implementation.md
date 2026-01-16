# Internal Implementation

This document explains the internal implementation details: Map data structure, useState pattern, and useId() for keys.

---

## Table of Contents

1. [Requirements](#requirements)
2. [Map Data Structure](#map-data-structure)
3. [useState Without Setter](#usestate-without-setter)
4. [useId() for Keys](#useid-for-keys)
5. [Handler Registration Flow](#handler-registration-flow)

---

## Requirements

The handler system must satisfy:

### Handler Management

| Requirement | Description |
|-------------|-------------|
| Multiple handlers | Multiple components can register handlers simultaneously |
| Precise unregistration | Only the specific handler is removed on unmount |
| Fast lookup/delete | Performance matters for execution and deletion |

### React Integration

| Requirement | Description |
|-------------|-------------|
| Minimize re-renders | Registration/unregistration shouldn't trigger re-renders |
| Context sharing | Handler Map accessible app-wide |
| useEffect compatible | Registration happens in useEffect (side effect) |

### Handler Identification

| Requirement | Description |
|-------------|-------------|
| Unique identification | Each handler must be uniquely identifiable |
| Stable across re-renders | ID must not change on re-render |

---

## Map Data Structure

### Why Map?

```typescript
type HandlerMap = Map<string, HandlerDef>;

interface HandlerDef {
  id: string;
  callback: BackNavigationCallback;
  override: boolean;
  overridePriority: 0 | 1 | 2 | 3;
  once: boolean;
}
```

We use React's `useId()` to generate unique string keys.

### Alternatives Comparison

| Option | Pros | Cons |
|--------|------|------|
| `Array<HandlerDef>` | Simple | O(n) deletion, O(n) lookup |
| `Object { [id]: HandlerDef }` | O(1) operations | No insertion order guarantee (pre-ES2015) |
| `Map<string, HandlerDef>` ✓ | O(1) operations, insertion order guaranteed | - |

### Map Advantages

**O(1) Performance**:
```typescript
handlerMap.set(callbackId, handlerDef);  // O(1)
handlerMap.delete(callbackId);            // O(1)
handlerMap.get(callbackId);               // O(1)
```

**Insertion Order Guaranteed** (ES2015+):
```typescript
const entries = Array.from(handlerMap.values());
// entries[0] is the first registered handler
```

---

## useState Without Setter

### Implementation

```typescript
export function BackNavigationHandlerProvider({
  children,
  preRegisteredHandler,
}: BackNavigationHandlerProviderProps) {
  // Setter intentionally unused - mutate Map directly to avoid re-renders
  const [handlerMap] = useState(() => new Map<string, HandlerDef>());

  useInterceptPopState({ handlerMap, preRegisteredHandler });

  return (
    <BackNavigationHandlerContext.Provider value={handlerMap}>
      {children}
    </BackNavigationHandlerContext.Provider>
  );
}
```

### Why Not Use the Setter?

**Key requirement**: No re-renders on handler registration/unregistration.

**If we used setState**:

| Action | Result |
|--------|--------|
| Handler A registered | setState → **All consumers re-render** |
| Handler B registered | setState → **All consumers re-render** |
| Handler A unregistered | setState → **All consumers re-render** |

Problems:
- Cascade re-renders on every registration
- Performance degrades with more handlers
- Potential infinite loops with useEffect dependencies

**With stable Map reference (no setter)**:

| Action | Result |
|--------|--------|
| Handler A registered | `map.set()` → **No re-render** |
| Handler B registered | `map.set()` → **No re-render** |
| Handler A unregistered | `map.delete()` → **No re-render** |

Benefits:
- Map reference stays stable across renders
- Direct mutation doesn't trigger React updates
- Zero performance overhead for registration

### Why useState Instead of useRef?

Both achieve the same goal:

```typescript
// Option A: useRef
const mapRef = useRef(new Map());
// ✅ No re-render trigger
// ✅ Stable reference
// 👎 Interface: mapRef.current.set(), mapRef.current.delete()

// Option B: useState (no setter)
const [map] = useState(() => new Map());
// ✅ No re-render trigger
// ✅ Stable reference
// 👍 Interface: map.set(), map.delete()
```

**Choice**: Pure **interface convenience**.

- `mapRef.current.set(...)` → `map.set(...)`
- `mapRef.current.delete(...)` → `map.delete(...)`
- No `.current` access needed

---

## useId() for Keys

### Why useId() Instead of Function as Key?

Map supports functions as keys:

```typescript
// Function as key
const wrappedHandler = () => handler();
map.set(wrappedHandler, options);
return () => map.delete(wrappedHandler);
```

But we use `useId()`:

```typescript
// String ID as key
const callbackId = useId();
map.set(callbackId, { callback: handler, ... });
return () => map.delete(callbackId);
```

### Comparison

| Aspect | Function Key | useId() Key |
|--------|--------------|-------------|
| Unique identification | ✅ Function reference | ✅ React-generated ID |
| Stable across re-renders | ✅ Created in useEffect | ✅ useId() guarantees |
| O(1) deletion | ✅ | ✅ |
| Precise deletion | ✅ | ✅ |

Both achieve the same core goals.

### Why useId() is Better

1. **Simpler**: No wrapper function needed
2. **Debuggable**: String ID visible in logs
3. **Handler-change safe**: ID stays same even if handler reference changes

```typescript
// Function key potential issue
const handler = useCallback(() => {...}, [dep]);
// When dep changes → new function reference
// → useEffect re-runs → delete old, add new
// → Works, but requires wrapper pattern

// useId() approach
const callbackId = useId();
// When dep changes → ID stays the same
// → Cleanup deletes exact same ID
```

**Conclusion**: `useId()` achieves the same effect as function-as-key but is safer and simpler.

---

## Handler Registration Flow

### Implementation

```typescript
export function useRegisterBackNavigationHandler(
  handler: BackNavigationHandler,
  options: PartialBackNavigationHandlerOptions = DEFAULT_OPTIONS
) {
  const callbackId = useId();
  const handlerMap = useContext(BackNavigationHandlerContext);

  useIsomorphicLayoutEffect(() => {
    // 1. Apply defaults
    const resolvedOptions = { /* ... */ };
    
    // 2. Skip if disabled or already executed (once: true)
    if (!resolvedOptions.enable || (resolvedOptions.once && hasExecutedRef.current)) {
      return;
    }
    
    // 3. Check conflicts
    const conflictMessage = checkConflict(resolvedOptions, handlerMap);
    if (conflictMessage) {
      console.warn(conflictMessage);
    }
    
    // 4. Register (no re-render)
    handlerMap.set(callbackId, {
      id: callbackId,
      callback: async (params) => {
        hasExecutedRef.current = true;
        return handler();
      },
      override: resolvedOptions.override,
      overridePriority: resolvedOptions.override ? resolvedOptions.overridePriority : 1,
      once: resolvedOptions.once,
    });
    
    // 5. Cleanup on unmount
    return () => {
      handlerMap.delete(callbackId);
    };
  }, [callbackId, handlerMap, handler, options]);
}
```

### Lifecycle Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                  HANDLER LIFECYCLE                                  │
│                                                                     │
│   Component Mount                                                   │
│        │                                                            │
│        ▼                                                            │
│   useIsomorphicLayoutEffect runs                                    │
│        │                                                            │
│        ▼                                                            │
│   ┌─────────────────────────────────────┐                           │
│   │  handlerMap.set(id, handlerDef)     │  ← No re-render           │
│   └─────────────────────────────────────┘                           │
│        │                                                            │
│        ▼                                                            │
│   Component active (handler registered)                             │
│        │                                                            │
│        ▼                                                            │
│   Component Unmount                                                 │
│        │                                                            │
│        ▼                                                            │
│   useEffect cleanup runs                                            │
│        │                                                            │
│        ▼                                                            │
│   ┌─────────────────────────────────────┐                           │
│   │  handlerMap.delete(id)              │  ← No re-render           │
│   └─────────────────────────────────────┘                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Summary

| Decision | Reason |
|----------|--------|
| **Map data structure** | O(1) operations, insertion order guaranteed |
| **useState without setter** | Prevent re-renders on registration |
| **useState over useRef** | Cleaner interface (no `.current`) |
| **useId() for keys** | Stable, debuggable, simpler than function keys |

This design enables **zero-overhead** handler registration across multiple components.
