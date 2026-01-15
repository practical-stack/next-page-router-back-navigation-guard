# 핸들러 우선순위 시스템

이 문서는 여러 BackNavigationHandler가 등록될 때의 우선순위 시스템과 충돌 감지를 설명합니다.

---

## 목차

1. [왜 다중 핸들러가 필요한가?](#왜-다중-핸들러가-필요한가)
2. [우선순위 계층](#우선순위-계층)
3. [충돌 감지](#충돌-감지)
4. [핸들러 옵션](#핸들러-옵션)
5. [실행 흐름](#실행-흐름)

---

## 왜 다중 핸들러가 필요한가?

### 단순한 앱: 하나의 핸들러로 충분

```tsx
useRegisterBackNavigationHandler(() => {
  return window.confirm("저장하지 않은 변경사항이 있습니다. 나가시겠습니까?");
});
```

### 복잡한 앱: 여러 핸들러 필요

실제 앱에서는 여러 컴포넌트가 독립적으로 뒤로가기를 처리해야 합니다:

```
App
├── GlobalModalProvider
│   └── 핸들러: 모달 열려있으면 닫기
├── Page
│   └── 핸들러: 폼 dirty 상태면 확인 표시
└── BottomSheet
    └── 핸들러: 시트 열려있으면 닫기
```

**문제**: 어떤 핸들러가 먼저 실행되어야 하는가?

---

## 우선순위 계층

핸들러는 다음 순서로 실행됩니다 (높은 우선순위 → 낮은 우선순위):

| 우선순위 | 타입 | 설명 |
|---------|------|------|
| 1순위 | `preRegisteredHandler` | Provider 레벨에서 설정 |
| 2순위 | `override: true` 핸들러 | `overridePriority`로 정렬 (0 → 1 → 2 → 3) |
| 3순위 | `override: false` 핸들러 | 기본 핸들러 (하나만 허용) |

### preRegisteredHandler

Provider 레벨에서 설정하는 전역 핸들러. 항상 먼저 실행됩니다.

```tsx
<BackNavigationHandlerProvider
  preRegisteredHandler={() => {
    if (globalModal.isOpen) {
      globalModal.close();
      return false;  // 네비게이션 차단
    }
    return true;  // 다음 핸들러로 진행
  }}
>
  <App />
</BackNavigationHandlerProvider>
```

**용도**: 항상 먼저 확인해야 하는 로직 (전역 모달, 로딩 상태).

### override 옵션

기본 `override: false`는 "일반 핸들러"를 의미합니다. 일반 핸들러는 **하나만** 등록 가능합니다.

```tsx
// 일반 핸들러 (override: false가 기본값)
useRegisterBackNavigationHandler(() => {
  return window.confirm("페이지를 나가시겠습니까?");
});
```

`override: true`를 설정하면 일반 핸들러보다 먼저 실행되는 추가 핸들러를 등록할 수 있습니다.

```tsx
// Override 핸들러 - 일반 핸들러보다 먼저 실행
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

여러 `override: true` 핸들러가 있을 때 순서를 결정합니다.

```typescript
overridePriority: 0 | 1 | 2 | 3  // 낮을수록 높은 우선순위 (기본값: 1)
```

```tsx
// Priority 0: 가장 먼저 실행
useRegisterBackNavigationHandler(
  () => handleCriticalAction(),
  { override: true, overridePriority: 0 }
);

// Priority 1: 두 번째로 실행 (기본값)
useRegisterBackNavigationHandler(
  () => handleNormalOverride(),
  { override: true }
);

// Priority 2: 세 번째로 실행
useRegisterBackNavigationHandler(
  () => handleLowPriority(),
  { override: true, overridePriority: 2 }
);
```

---

## 충돌 감지

라이브러리는 잘못된 핸들러 조합을 감지하고 경고를 출력합니다.

### 충돌 1: 두 개의 일반 핸들러

```tsx
// ComponentA
useRegisterBackNavigationHandler(() => confirm("A"));

// ComponentB (같은 페이지)
useRegisterBackNavigationHandler(() => confirm("B"));
// → 경고: 다른 non-override 핸들러가 이미 존재합니다
```

**해결책**: 추가 핸들러에 `override: true` 사용.

### 충돌 2: 같은 우선순위의 Override 핸들러

```tsx
useRegisterBackNavigationHandler(() => confirm("A"), { override: true });

useRegisterBackNavigationHandler(() => confirm("B"), { override: true });
// → 경고: 우선순위 1의 핸들러가 이미 존재합니다
```

**해결책**: 다른 `overridePriority` 값 사용.

### 유효한 조합

```tsx
// ✅ 하나의 일반 핸들러
useRegisterBackNavigationHandler(() => confirm("A"));

// ✅ override로 추가
useRegisterBackNavigationHandler(() => confirm("B"), { override: true });

// ✅ 다른 우선순위
useRegisterBackNavigationHandler(() => confirm("C"), {
  override: true,
  overridePriority: 0
});
```

---

## 핸들러 옵션

### enable 옵션

React Hook 규칙을 지키면서 조건부 등록을 허용합니다.

```tsx
// ❌ 잘못됨: Hook이 조건부로 호출됨
if (isFormDirty) {
  useRegisterBackNavigationHandler(() => confirm("나가시겠습니까?"));
}

// ✅ 올바름: 항상 호출하고 enable으로 조건 지정
useRegisterBackNavigationHandler(
  () => confirm("저장하지 않은 변경사항이 있습니다. 나가시겠습니까?"),
  { enable: isFormDirty }
);
```

**용도**:
- 폼 dirty 상태
- 에디터 열림 상태
- 로딩 상태

### once 옵션

핸들러가 한 번 실행 후 자동으로 해제됩니다. **반환값과 무관하게** 즉시 삭제됩니다.

```tsx
useRegisterBackNavigationHandler(
  () => {
    console.log("첫 번째 뒤로가기에서만 실행");
    return true;
  },
  { once: true }
);
```

**중요**: 핸들러는 실행 즉시 삭제되며, 네비게이션 허용 여부와 관계없습니다.

| 시나리오 | 핸들러 반환값 | 실행 후 핸들러 상태 |
|---------|--------------|-------------------|
| 사용자 확인 | `true` (허용) | 삭제됨 |
| 사용자 취소 | `false` (차단) | 삭제됨 |

**다이얼로그 예시**:

```tsx
useRegisterBackNavigationHandler(
  () => {
    // 확인 다이얼로그 표시
    // 이 함수가 실행되는 시점에 핸들러는 이미 삭제됨
    return window.confirm("페이지를 나가시겠습니까?");
  },
  { once: true }
);
```

시나리오:
1. 첫 번째 뒤로가기 → 핸들러가 다이얼로그 표시 → 사용자 "취소" 클릭 → 핸들러 삭제됨, 네비게이션 차단
2. 두 번째 뒤로가기 → 핸들러 없음 → 네비게이션 진행 (또는 preRegisteredHandler가 등록되어 있으면 실행)

### 옵션 조합

```tsx
const [showOnboarding, setShowOnboarding] = useState(true);

useRegisterBackNavigationHandler(
  () => {
    const confirmed = window.confirm("온보딩을 건너뛰시겠습니까?");
    if (confirmed) setShowOnboarding(false);
    return confirmed;
  },
  { once: true, enable: showOnboarding }
);
```

---

## 실행 흐름

```
Back Navigation Triggered
        │
        ▼
┌─────────────────────────────────────┐
│ 1. preRegisteredHandler 실행        │
│    → false 반환 시 차단             │
└─────────────────────────────────────┘
        │ true 반환
        ▼
┌─────────────────────────────────────┐
│ 2. 핸들러 정렬                       │
│    - override: true (우선순위순)     │
│    - override: false                │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│ 3. once: true면 핸들러 삭제          │
│    (실행 전에 삭제됨)                │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│ 4. 첫 번째 핸들러 실행               │
│    → false 반환 시 차단             │
└─────────────────────────────────────┘
        │ true 반환
        ▼
┌─────────────────────────────────────┐
│ 5. 네비게이션 허용                   │
└─────────────────────────────────────┘
```

### 실제 예시

```tsx
// Provider 레벨 - 우선순위 1
<BackNavigationHandlerProvider
  preRegisteredHandler={() => {
    if (globalLoading) return false;
    return true;
  }}
>

// ComponentA - 우선순위 2 (override: true, priority: 0)
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

// ComponentB - 우선순위 3 (override: true, priority: 1)
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

// ComponentC - 우선순위 4 (override: false)
useRegisterBackNavigationHandler(() => {
  return window.confirm("페이지를 나가시겠습니까?");
});
```

**실행 순서**:
1. `globalLoading` 확인
2. `criticalModal` 확인
3. `bottomSheet` 확인
4. 확인 다이얼로그 표시

어느 단계에서든 `false`가 반환되면 네비게이션이 차단됩니다.

---

## 요약

| 개념 | 설명 |
|------|------|
| **preRegisteredHandler** | Provider 레벨, 최고 우선순위 |
| **override: false** | 일반 핸들러, 하나만 허용 |
| **override: true** | 우선순위 핸들러, 여러 개 허용 |
| **overridePriority** | 0-3, 낮을수록 높은 우선순위 |
| **충돌 감지** | 잘못된 조합 시 console.warn |
| **enable** | 조건부 등록 |
| **once** | 실행 후 자동 해제 |
