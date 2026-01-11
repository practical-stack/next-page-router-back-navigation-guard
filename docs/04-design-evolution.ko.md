# 설계 진화 과정

이 문서는 핸들러 우선순위 시스템의 진화 과정을 설명합니다 - useEffect 순서 기반에서 명시적 override 시스템으로.

---

## 목차

1. [개요](#개요)
2. [첫 번째 구현: useEffect 순서](#첫-번째-구현-useeffect-순서)
3. [문제: Re-render 시 우선순위 역전](#문제-re-render-시-우선순위-역전)
4. [해결책: Override + Priority 시스템](#해결책-override--priority-시스템)
5. [핵심 교훈](#핵심-교훈)

---

## 개요

백 네비게이션 핸들러 시스템은 뒤로가기 버튼이 눌렸을 때 실행되는 콜백을 등록합니다. 여러 핸들러가 동시에 등록되어 있을 때, **어떤 핸들러를 먼저 실행할지** 결정하는 로직이 필요합니다.

---

## 첫 번째 구현: useEffect 순서

### 아이디어

React의 `useEffect`는 **bottom-up**으로 실행됩니다 (자식 → 부모). 이를 활용했습니다:

1. 가장 깊은 자식의 핸들러가 먼저 등록
2. Map의 첫 번째 항목을 실행
3. 결과: 가장 깊은 컴포넌트의 핸들러가 먼저 실행

```
useEffect execution order (Bottom-Up):
1. Child (deep) → Handler registered (Entry 1)
2. Parent (upper) → Handler registered (Entry 2)

On back button:
→ Execute Map's First Entry (Child Handler) ✓
```

### 처음에 동작했던 이유

초기 마운트 시 useEffect 순서가 컴포넌트 깊이와 일치했기 때문에 의도대로 동작했습니다.

### 초기 코드

```typescript
const getFirstEntryOfMap = <K, V>(map: Map<K, V>): [K, V] | undefined => {
  const iterator = map.entries();
  const firstEntry = iterator.next();
  return !firstEntry.done ? firstEntry.value : undefined;
};

// 첫 번째 항목 실행
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

## 문제: Re-render 시 우선순위 역전

### 버그: Nested 컴포넌트만 Re-render될 때

nested 컴포넌트만 re-render되면:

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

Result: Nested 대신 Parent Handler가 실행됨!
```

### 시간 순서

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

### 순서 기반 접근법이 실패하는 이유

| 접근법 | 문제 |
|--------|------|
| First Entry Wins | Re-render가 항목 순서 변경 |
| Last Entry Wins | 같은 문제 |
| Registration Timestamp | Re-render가 새 타임스탬프 생성 |
| Component Tree Depth | React가 depth 정보 노출 안함 |

**결론**: 순서 기반 접근법은 useEffect cleanup/setup 사이클이 re-render 시 Map 항목 순서를 **항상** 예측 불가능하게 변경하므로 실패합니다.

---

## 해결책: Override + Priority 시스템

### 새 아키텍처

등록 순서에 의존하는 대신, **명시적 우선순위 옵션**을 사용합니다:

```typescript
interface HandlerOptions {
  once: boolean;           // 실행 후 삭제
  enable: boolean;         // 활성화 플래그
  override: boolean;       // 우선순위 override 플래그
  overridePriority?: 0|1|2|3;  // override=true일 때만
}
```

실행 우선순위:
1. `override: true` 핸들러 (`overridePriority`로 정렬, 0 = 최우선)
2. `override: false` 핸들러
3. 기본 뒤로가기 네비게이션

### 정렬 구현

```typescript
function sortHandlersByPriority(handlers: HandlerDef[]): HandlerDef[] {
  return [...handlers].sort((a, b) => {
    // Override 핸들러가 먼저
    if (a.override && !b.override) return -1;
    if (!a.override && b.override) return 1;

    // Override 핸들러 간에는 priority로 정렬
    if (a.override && b.override) {
      return a.overridePriority - b.overridePriority;
    }

    // Non-override 핸들러는 순서 유지
    return 0;
  });
}
```

### 문제 해결 방식

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
  (Parent, {override: false}),  ← Entry 순서 변경됨
  (Nested, {override: true})    ← 하지만 override는 여전히 true!
]

T2: Back Button Pressed
══════════════════════════
sorted = sortByPriority(entries)
      = [(Nested, {override:true}), (Parent, {override:false})]

Execute: Nested Handler ✓ (Map 순서와 관계없이 올바르게 실행!)
```

### 사용 예시

```tsx
// ❌ 이전: 순서 의존 (불안정)
useRegisterBackNavigationHandler(() => {
  console.log('Nested handler');  // Re-render 후 실행 안될 수 있음!
  return false;
});

// ✅ 새로운 방식: 명시적 우선순위
useRegisterBackNavigationHandler(
  () => {
    console.log('Nested handler');  // 항상 먼저 실행!
    return false;
  },
  { override: true }
);
```

---

## 핵심 교훈

1. **useEffect 순서에 의존하지 마라** - Re-render가 순서를 바꾼다
2. **Map/Array 삽입 순서에 의존하지 마라** - 삭제/재삽입이 순서를 바꾼다
3. **명시적 우선순위가 암묵적 순서보다 안전하다** - `override` 옵션이 의도를 명확히 함
4. **충돌 감지로 실수 방지** - 잘못된 조합에 경고

---

## 요약

| 문제 | 원인 | 해결책 |
|------|------|--------|
| Re-render 시 우선순위 역전 | useEffect cleanup/setup이 Map 순서 변경 | 명시적 우선순위를 위한 `override` 옵션 |
| 멀티스텝 플로우에서 핸들러 충돌 | 여러 핸들러, 보장된 순서 없음 | step 핸들러에 `override: true` |
| 개발자 실수 | 어떤 핸들러가 실행될지 불명확 | console.warn으로 충돌 감지 |

---

## 관련 파일

| 파일 | 역할 |
|------|------|
| `src/hooks/useRegisterBackNavigationHandler.ts` | 옵션이 있는 핸들러 등록 |
| `src/utils/sortHandlers.ts` | 우선순위 기반 정렬 |
| `src/hooks/useInterceptPopState.ts` | 핸들러 실행 로직 |
