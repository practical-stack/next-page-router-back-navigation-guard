# next-page-router-back-navigation-guard 문서

이 문서는 `next-page-router-back-navigation-guard` 라이브러리의 설계, 구현 및 사용법을 설명합니다.

---

## 읽는 순서

문서는 완전한 스토리를 전달하도록 구성되어 있습니다. 순서대로 읽으면 이해가 쉽습니다.

### 사용자용

| # | 문서 | 설명 |
|---|------|------|
| 01 | [이 라이브러리가 필요한 이유](./01-why-this-library.ko.md) | **여기서 시작.** 핵심 문제와 해결책 (URL 복원, index 추적, 세션 토큰). |
| 02 | [차단 시나리오](./02-blocking-scenarios.ko.md) | 모든 뒤로가기 시나리오와 흐름도. |
| 03 | [우선순위 시스템](./03-priority-system.ko.md) | 핸들러 옵션: `override`, `enable`, `once`, 충돌 감지. |

### 기여자용

| # | 문서 | 설명 |
|---|------|------|
| 04 | [설계 진화 과정](./04-design-evolution.ko.md) | useEffect 순서에서 명시적 우선순위 시스템으로 바꾼 이유. |
| 05 | [내부 구현](./05-internal-implementation.ko.md) | Map 구조, useState 패턴, useId() 키. |

---

## 빠른 참조

### API 옵션

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `override` | `false` | 우선순위 핸들러 (일반 핸들러보다 먼저 실행) |
| `overridePriority` | `1` | 우선순위 레벨 0-3 (낮을수록 높은 우선순위) |
| `enable` | `true` | 조건부 등록 |
| `once` | `false` | 실행 후 자동 해제 |

### 소스 파일

| 파일 | 역할 |
|------|------|
| `src/hooks/useRegisterBackNavigationHandler.ts` | 핸들러 등록 훅 |
| `src/hooks/useInterceptPopState.ts` | Popstate 인터셉션 (핵심) |
| `src/utils/historyAugmentation.tsx` | History API 패치 |
| `src/utils/sortHandlers.ts` | 우선순위 기반 정렬 |
| `src/components/BackNavigationHandlerProvider.tsx` | Provider 컴포넌트 |

---

## 번역

- [English](./README.md)
