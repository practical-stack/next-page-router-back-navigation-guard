# 내부 구현

이 문서는 내부 구현 상세를 설명합니다: Map 자료구조, useState 패턴, useId() 키.

---

## 목차

1. [요구사항](#요구사항)
2. [Map 자료구조](#map-자료구조)
3. [useState Setter 미사용](#usestate-setter-미사용)
4. [useId() 키](#useid-키)
5. [핸들러 등록 흐름](#핸들러-등록-흐름)

---

## 요구사항

핸들러 시스템은 다음을 충족해야 합니다:

### 핸들러 관리

| 요구사항 | 설명 |
|----------|------|
| 다중 핸들러 | 여러 컴포넌트가 동시에 핸들러 등록 가능 |
| 정확한 해제 | unmount 시 해당 핸들러만 제거 |
| 빠른 조회/삭제 | 실행과 삭제 시 성능 중요 |

### React 통합

| 요구사항 | 설명 |
|----------|------|
| Re-render 최소화 | 등록/해제가 re-render 트리거하면 안됨 |
| Context 공유 | 핸들러 Map에 앱 전역에서 접근 가능 |
| useEffect 호환 | 등록이 useEffect에서 발생 (side effect) |

### 핸들러 식별

| 요구사항 | 설명 |
|----------|------|
| 고유 식별 | 각 핸들러가 고유하게 식별 가능 |
| Re-render 간 안정성 | ID가 re-render에도 변경 안됨 |

---

## Map 자료구조

### 왜 Map인가?

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

React의 `useId()`로 생성한 고유 문자열 키를 사용합니다.

### 대안 비교

| 옵션 | 장점 | 단점 |
|------|------|------|
| `Array<HandlerDef>` | 단순함 | O(n) 삭제, O(n) 조회 |
| `Object { [id]: HandlerDef }` | O(1) 연산 | 삽입 순서 미보장 (pre-ES2015) |
| `Map<string, HandlerDef>` ✓ | O(1) 연산, 삽입 순서 보장 | - |

### Map 장점

**O(1) 성능**:
```typescript
handlerMap.set(callbackId, handlerDef);  // O(1)
handlerMap.delete(callbackId);            // O(1)
handlerMap.get(callbackId);               // O(1)
```

**삽입 순서 보장** (ES2015+):
```typescript
const entries = Array.from(handlerMap.values());
// entries[0]이 첫 번째 등록된 핸들러
```

---

## useState Setter 미사용

### 구현

```typescript
export function BackNavigationHandlerProvider({
  children,
  preRegisteredHandler,
}: BackNavigationHandlerProviderProps) {
  // Setter 의도적 미사용 - re-render 방지를 위해 Map 직접 mutation
  const [handlerMap] = useState(() => new Map<string, HandlerDef>());

  useInterceptPopState({ handlerMap, preRegisteredHandler });

  return (
    <BackNavigationHandlerContext.Provider value={handlerMap}>
      {children}
    </BackNavigationHandlerContext.Provider>
  );
}
```

### 왜 Setter를 사용하지 않는가?

**핵심 요구사항**: 핸들러 등록/해제 시 re-render 없어야 함.

**setState 사용 시**:

| 동작 | 결과 |
|------|------|
| Handler A 등록 | setState → **모든 consumer re-render** |
| Handler B 등록 | setState → **모든 consumer re-render** |
| Handler A 해제 | setState → **모든 consumer re-render** |

문제점:
- 매 등록마다 cascade re-render
- 핸들러가 많아질수록 성능 저하
- useEffect dependency로 인한 무한 루프 가능성

**안정적인 Map 참조 사용 (setter 없음)**:

| 동작 | 결과 |
|------|------|
| Handler A 등록 | `map.set()` → **re-render 없음** |
| Handler B 등록 | `map.set()` → **re-render 없음** |
| Handler A 해제 | `map.delete()` → **re-render 없음** |

장점:
- Map 참조가 렌더 간에 안정적으로 유지
- 직접 mutation이 React 업데이트 트리거 안함
- 등록에 대한 성능 오버헤드 제로

### 왜 useRef 대신 useState인가?

둘 다 같은 목적을 달성합니다:

```typescript
// Option A: useRef
const mapRef = useRef(new Map());
// ✅ re-render 트리거 안함
// ✅ 안정적인 참조
// 👎 인터페이스: mapRef.current.set(), mapRef.current.delete()

// Option B: useState (setter 없음)
const [map] = useState(() => new Map());
// ✅ re-render 트리거 안함
// ✅ 안정적인 참조
// 👍 인터페이스: map.set(), map.delete()
```

**선택**: 순수한 **인터페이스 편의성**.

- `mapRef.current.set(...)` → `map.set(...)`
- `mapRef.current.delete(...)` → `map.delete(...)`
- `.current` 접근 불필요

---

## useId() 키

### 왜 함수 대신 useId()를 키로 사용하는가?

Map은 함수를 키로 지원합니다:

```typescript
// 함수를 키로
const wrappedHandler = () => handler();
map.set(wrappedHandler, options);
return () => map.delete(wrappedHandler);
```

하지만 우리는 `useId()`를 사용합니다:

```typescript
// 문자열 ID를 키로
const callbackId = useId();
map.set(callbackId, { callback: handler, ... });
return () => map.delete(callbackId);
```

### 비교

| 측면 | 함수 키 | useId() 키 |
|------|---------|------------|
| 고유 식별 | ✅ 함수 참조 | ✅ React 생성 ID |
| Re-render 간 안정성 | ✅ useEffect 내 생성 | ✅ useId() 보장 |
| O(1) 삭제 | ✅ | ✅ |
| 정확한 삭제 | ✅ | ✅ |

둘 다 같은 핵심 목적을 달성합니다.

### useId()가 더 나은 이유

1. **더 단순함**: wrapper 함수 불필요
2. **디버깅 가능**: 문자열 ID가 로그에서 보임
3. **handler 변경에 안전**: handler 참조가 바뀌어도 ID 유지

```typescript
// 함수 키의 잠재적 문제
const handler = useCallback(() => {...}, [dep]);
// dep 변경 시 → 새 함수 참조
// → useEffect 재실행 → 기존 삭제, 새로 추가
// → 동작하지만 wrapper 패턴 필요

// useId() 접근법
const callbackId = useId();
// dep 변경 시 → ID 동일
// → cleanup이 정확히 같은 ID 삭제
```

**결론**: `useId()`는 함수-키와 같은 효과를 달성하면서 더 안전하고 단순합니다.

---

## 핸들러 등록 흐름

### 구현

```typescript
export function useRegisterBackNavigationHandler(
  handler: BackNavigationHandler,
  options: PartialBackNavigationHandlerOptions = DEFAULT_OPTIONS
) {
  const callbackId = useId();
  const handlerMap = useContext(BackNavigationHandlerContext);

  useIsomorphicLayoutEffect(() => {
    // 1. 기본값 적용
    const resolvedOptions = { /* ... */ };
    
    // 2. 비활성화 또는 이미 실행된 경우 (once: true) 스킵
    if (!resolvedOptions.enable || (resolvedOptions.once && hasExecutedRef.current)) {
      return;
    }
    
    // 3. 충돌 검사
    const conflictMessage = checkConflict(resolvedOptions, handlerMap);
    if (conflictMessage) {
      console.warn(conflictMessage);
    }
    
    // 4. 등록 (re-render 없음)
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
    
    // 5. unmount 시 cleanup
    return () => {
      handlerMap.delete(callbackId);
    };
  }, [callbackId, handlerMap, handler, options]);
}
```

### 라이프사이클 다이어그램

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

## 요약

| 결정 | 이유 |
|------|------|
| **Map 자료구조** | O(1) 연산, 삽입 순서 보장 |
| **useState setter 미사용** | 등록 시 re-render 방지 |
| **useRef 대신 useState** | 더 깔끔한 인터페이스 (`.current` 불필요) |
| **useId() 키** | 안정적, 디버깅 가능, 함수 키보다 단순 |

이 설계로 여러 컴포넌트에서 **오버헤드 없이** 핸들러를 등록할 수 있습니다.
