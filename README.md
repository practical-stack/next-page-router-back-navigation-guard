# next-page-router-back-navigation-guard

You use Next.js Pages Router, and you want to show "You have unsaved changes that will be lost." dialog when user presses back button?
This library is just for you!

## How does it work?

- [English Slide](https://speakerdeck.com/ypresto/cancel-next-js-page-navigation-full-throttle)
- [Japanese Slide](https://speakerdeck.com/ypresto/hack-to-prevent-page-navigation-in-next-js)

## Installation

```bash
npm install next-page-router-back-navigation-guard
# or
yarn add next-page-router-back-navigation-guard
# or
pnpm add next-page-router-back-navigation-guard
```

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
    once: false,      // If true, handler executes once then unregisters
    enable: true,     // If false, handler is not registered
    override: false,  // If true, handler has priority over non-override handlers
  }
);
```

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

See working example in `example/` directory and its `RegisterBackNavigationHandler` component.
