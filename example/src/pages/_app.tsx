import type { AppProps } from "next/app";
import { useCallback, useEffect, useRef } from "react";
import { BackNavigationHandlerProvider } from "next-page-router-back-navigation-guard";
import { OverlayProvider, overlay, useCurrentOverlay } from "overlay-kit";

/**
 * @see docs/06-preregistered-handler-reference-stability.md
 */
function useCurrentOverlayRef() {
  const currentOverlay = useCurrentOverlay();
  const ref = useRef(currentOverlay);

  useEffect(() => {
    ref.current = currentOverlay;
  }, [currentOverlay]);

  return ref;
}

function AppContent({ Component, pageProps }: Omit<AppProps, "router">) {
  const currentOverlayRef = useCurrentOverlayRef();

  const preRegisteredHandler = useCallback(() => {
    if (currentOverlayRef.current) {
      overlay.close(currentOverlayRef.current);
      return false;
    }
    return true;
  }, [currentOverlayRef]);

  return (
    <BackNavigationHandlerProvider preRegisteredHandler={preRegisteredHandler}>
      <Component {...pageProps} />
    </BackNavigationHandlerProvider>
  );
}

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <OverlayProvider>
      <AppContent Component={Component} pageProps={pageProps} />
    </OverlayProvider>
  );
}
