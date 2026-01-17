# next-page-router-back-navigation-guard

You use Next.js Pages Router, and you want to show "You have unsaved changes that will be lost." dialog when user presses back button?
This library is just for you!

## Background

This package is based on [next-navigation-guard](https://github.com/LayerXcom/next-navigation-guard), but has been rebuilt from scratch to focus solely on **back navigation** support for **Pages Router** only.

## How does it work?

Please refer to the [docs](./docs) for detailed information.

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

## Example

Try the [Live Demo](https://practical-stack.github.io/next-page-router-back-navigation-guard/) or see the source code in `example/` directory.
