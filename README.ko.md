# next-page-router-back-navigation-guard

Next.js Pages Router를 사용 중이고, 사용자가 뒤로가기 버튼을 눌렀을 때
"저장되지 않은 변경사항이 사라집니다." 같은 다이얼로그를 보여주고 싶으신가요?
이 라이브러리가 바로 그 용도입니다.

## 배경

이 패키지는 [next-navigation-guard](https://github.com/LayerXcom/next-navigation-guard)를 기반으로 하지만,
**Pages Router 전용 뒤로가기 네비게이션** 지원에만 집중하도록 처음부터 다시 구현했습니다.

## 어떻게 동작하나요?

자세한 내용은 [문서](./docs/README.ko.md)를 참고하세요.

### 문서

| # | 문서 | 설명 |
|---|------|------|
| 01 | [이 라이브러리가 필요한 이유](./docs/01-why-this-library.ko.md) | 핵심 문제와 해결책 (URL 복원, index 추적, 세션 토큰) |
| 02 | [차단 시나리오](./docs/02-blocking-scenarios.ko.md) | 모든 뒤로가기 시나리오와 흐름도 |
| 03 | [우선순위 시스템](./docs/03-priority-system.ko.md) | 핸들러 옵션: `override`, `enable`, `once`, 충돌 감지 |
| 07 | [한계](./docs/07-limitation.ko.md) | 알려진 한계와 동작하지 않는 케이스 |

기여자용: [설계 진화 과정](./docs/04-design-evolution.ko.md) | [내부 구현](./docs/05-internal-implementation.ko.md) | [preRegisteredHandler 참조 안정성](./docs/06-preregistered-handler-reference-stability.ko.md)

## 라이브 데모

직접 확인해보세요: **[Live Demo](https://practical-stack.github.io/next-page-router-back-navigation-guard/)**

## 설치

> **참고:** 이 패키지는 아직 npm에 배포되지 않았습니다. 곧 배포 예정입니다.

## 설정

Pages Router: `pages/_app.tsx`

```tsx
import { BackNavigationHandlerProvider } from "next-page-router-back-navigation-guard";

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <BackNavigationHandlerProvider>
      <Component {...pageProps} />
    </BackNavigationHandlerProvider>
  );
}
```

## 사용법

```tsx
import { useRegisterBackNavigationHandler } from "next-page-router-back-navigation-guard";

function MyComponent() {
  useRegisterBackNavigationHandler(() => {
    return window.confirm("저장되지 않은 변경사항이 사라집니다.");
  });

  return <YourContent />;
}
```

## API

### `useRegisterBackNavigationHandler(handler, options?)`

뒤로가기 네비게이션(브라우저 뒤로가기 버튼, `router.back()`)에 대한 핸들러를 등록합니다.

```tsx
useRegisterBackNavigationHandler(
  () => {
    // true를 반환하면 네비게이션 허용
    // false를 반환하면 네비게이션 차단
    return window.confirm("페이지를 나가시겠습니까?");
  },
  {
    once: false,      // true면 한 번 실행된 뒤 즉시 해제됨 (반환값과 무관)
    enable: true,     // false면 핸들러가 등록되지 않음
    override: false,  // true면 non-override 핸들러보다 우선 실행됨
  }
);
```

> **`once` 옵션 참고:** `once: true`일 때는 핸들러가 `true`를 반환했는지 `false`를 반환했는지와 무관하게, 실행 즉시 제거됩니다. 즉 "한 번만 허용"이 아니라 "정확히 한 번만 실행"입니다.

### `BackNavigationHandlerProvider`

뒤로가기 네비게이션 처리를 활성화하는 Provider 컴포넌트입니다.

```tsx
<BackNavigationHandlerProvider
  preRegisteredHandler={() => {
    // 선택 사항: 가장 먼저, 가장 높은 우선순위로 실행됨
    // false를 반환하면 차단, true를 반환하면 허용
    if (isGlobalModalOpen) {
      closeModal();
      return false;
    }
    return true;
  }}
>
  <App />
</BackNavigationHandlerProvider>
```

## 무엇을 가로채나요?

| 네비게이션 종류 | 가로챔? |
|----------------|---------|
| 브라우저 뒤로가기 버튼 | Yes |
| `router.back()` | Yes |
| 브라우저 앞으로가기 버튼 | No |
| `router.push/replace` | No |
| `<Link>` 클릭 | No |
| 탭 닫기/새로고침 | No |

## 테스트

이 라이브러리는 Playwright 기반 **E2E 테스트만 사용**합니다 (unit test 없음). 테스트는 Chromium, Firefox, WebKit에서 실행됩니다.

### 테스트 실행

```bash
# 최초 1회: Playwright 브라우저 설치
pnpm e2e:install

# 전체 테스트 실행
pnpm e2e

# Playwright UI로 실행
pnpm e2e:ui
```

### 테스트 시나리오

| 테스트 스위트 | 설명 |
|--------------|------|
| **Basic Handler** | 다이얼로그 표시, 취소 시 차단, 확인 시 허용 |
| **Once Option** | 핸들러가 한 번 실행된 뒤 자동 해제됨 (반환값과 무관) |
| **Enable Option** | 조건부 핸들러 등록 (enable/disable 토글) |
| **Override Handlers** | 우선순위 핸들러가 일반 핸들러보다 먼저 실행 |
| **Priority Order** | 낮은 priority 숫자(0)가 높은 숫자(1, 2, 3)보다 먼저 실행 |
| **Pre-registered Handler** | Provider의 `preRegisteredHandler` prop으로 등록된 핸들러 |
| **Pre-registered Handler (Overlay Close)** | `preRegisteredHandler`가 오버레이를 닫고 네비게이션을 차단 |
| **Browser Back Button** | `page.goBack()`이 `router.back()`과 동일하게 핸들러를 트리거 |
| **After Refresh (Token Mismatch)** | 페이지 새로고침 후에도 핸들러가 정상 동작 |

### 브라우저 설정

Firefox는 `page.reload()` 이후 `page.goBack()`이 popstate 이벤트를 발생시키지 않는 알려진 이슈가 있어서 특별한 Playwright 설정이 필요합니다:

```typescript
// playwright.config.ts
{
  name: "firefox",
  use: {
    launchOptions: {
      firefoxUserPrefs: {
        "fission.webContentIsolationStrategy": 1,  // reload 후 goBack 문제 해결
      },
    },
  },
}
```

참고: https://github.com/microsoft/playwright/issues/23210

## 한계

[한계 문서](./docs/07-limitation.ko.md)에서 자세히 다루고 있으며, 대표적으로 다음과 같은 제약이 있습니다:
- 동일 App 내 history가 있어야 함 (첫 진입 페이지에서는 동작하지 않음)
- **핸들러 내부에서 `router.push/replace`를 사용하면 안 됨** — 브라우저 보안 정책 때문에 예측 불가능한 네비게이션 동작이 발생할 수 있음
- 페이지 새로고침 후에는 세션 토큰 불일치로 인해 앞으로가기가 뒤로가기처럼 처리될 수 있음
- 삼성 인터넷 브라우저의 "뒤로가기 리디렉션 차단" 기능 (기본 활성화)

## 예제

[Live Demo](https://practical-stack.github.io/next-page-router-back-navigation-guard/)를 직접 확인하거나, `example/` 디렉터리의 소스 코드를 참고하세요.

---

- [English](./README.md)
