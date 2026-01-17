# next-page-router-back-navigation-guard

You use Next.js Pages Router, and you want to show "You have unsaved changes that will be lost." dialog when user presses back button?
This library is just for you!

## Background

This package is based on [next-navigation-guard](https://github.com/LayerXcom/next-navigation-guard), but has been rebuilt from scratch to focus solely on **back navigation** support for **Pages Router** only.

## How does it work?

Please refer to the [docs](./docs) for detailed information.

### Documentation

| # | Document | Description |
|---|----------|-------------|
| 01 | [Why This Library](./docs/01-why-this-library.md) | Core problems and solutions (URL restoration, index tracking, session tokens) |
| 02 | [Blocking Scenarios](./docs/02-blocking-scenarios.md) | All back navigation scenarios with flow diagrams |
| 03 | [Priority System](./docs/03-priority-system.md) | Handler options: `override`, `enable`, `once`, conflict detection |
| 07 | [Limitations](./docs/07-limitation.md) | Known limitations and non-working cases |

For contributors: [Design Evolution](./docs/04-design-evolution.md) | [Internal Implementation](./docs/05-internal-implementation.md) | [preRegisteredHandler Reference Stability](./docs/06-preregistered-handler-reference-stability.md)

## Live Demo

Try it out: **[Live Demo](https://practical-stack.github.io/next-page-router-back-navigation-guard/)**

## Installation

> **Note:** This package is not yet published to npm. Coming soon!

## Setup

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

## Usage

```tsx
import { useRegisterBackNavigationHandler } from "next-page-router-back-navigation-guard";

function MyComponent() {
  useRegisterBackNavigationHandler(() => {
    return window.confirm("You have unsaved changes that will be lost.");
  });

  return <YourContent />;
}
```

## API

### `useRegisterBackNavigationHandler(handler, options?)`

Register a handler for back navigation (browser back button, `router.back()`).

```tsx
useRegisterBackNavigationHandler(
  () => {
    // Return true to allow navigation
    // Return false to block navigation
    return window.confirm("Leave page?");
  },
  {
    once: false,      // If true, handler executes once then unregisters (regardless of return value)
    enable: true,     // If false, handler is not registered
    override: false,  // If true, handler has priority over non-override handlers
  }
);
```

> **Note on `once` option**: When `once: true`, the handler is removed immediately upon execution, regardless of whether it returns `true` or `false`. This means "execute exactly once", not "allow navigation once".

### `BackNavigationHandlerProvider`

Provider component that enables back navigation handling.

```tsx
<BackNavigationHandlerProvider
  preRegisteredHandler={() => {
    // Optional: runs FIRST with highest priority
    // Return false to block, true to allow
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

## What's Intercepted

| Navigation Type | Intercepted? |
|-----------------|--------------|
| Browser back button | Yes |
| `router.back()` | Yes |
| Browser forward button | No |
| `router.push/replace` | No |
| `<Link>` clicks | No |
| Tab close/reload | No |

## Testing

This library uses **E2E tests only** (no unit tests) with Playwright. Tests run against Chromium, Firefox, and WebKit.

### Running Tests

```bash
# Install Playwright browsers (first time only)
pnpm e2e:install

# Run all tests
pnpm e2e

# Run with Playwright UI
pnpm e2e:ui
```

### Test Scenarios

| Test Suite | Description |
|------------|-------------|
| **Basic Handler** | Dialog show, block on cancel, allow on confirm |
| **Once Option** | Handler executes once then auto-unregisters (regardless of return value) |
| **Enable Option** | Conditional handler registration (enable/disable toggle) |
| **Override Handlers** | Priority handlers execute before normal handlers |
| **Priority Order** | Lower priority number (0) runs before higher (1, 2, 3) |
| **Pre-registered Handler** | Handler registered via Provider's `preRegisteredHandler` prop |
| **Pre-registered Handler (Overlay Close)** | `preRegisteredHandler` closes overlay and blocks navigation |
| **Browser Back Button** | `page.goBack()` triggers handler same as `router.back()` |
| **Redirect on Back** | Handler can redirect to different page using `router.push()` |
| **After Refresh (Token Mismatch)** | Handler works correctly after page reload |
| **Redirect to No Handler Page** | Navigation works normally on pages without handlers |

### Browser Configuration

Firefox requires special Playwright configuration due to a known bug where `page.goBack()` doesn't trigger popstate events after `page.reload()`:

```typescript
// playwright.config.ts
{
  name: "firefox",
  use: {
    launchOptions: {
      firefoxUserPrefs: {
        "fission.webContentIsolationStrategy": 1,  // Fix for goBack after reload
      },
    },
  },
}
```

Reference: https://github.com/microsoft/playwright/issues/23210

## Limitations

See [Limitations](./docs/07-limitation.md) for known limitations including:
- Requires history within the same app (doesn't work on first page entry)
- History stack issues when using `router.push/replace` inside handler (Chrome only)
- Samsung Internet Browser "Block backward redirections" feature (enabled by default)

## Example

Try the [Live Demo](https://practical-stack.github.io/next-page-router-back-navigation-guard/) or see the source code in `example/` directory.
