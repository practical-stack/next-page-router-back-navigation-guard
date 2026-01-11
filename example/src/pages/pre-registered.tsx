import Link from "next/link";
import { useRouter } from "next/router";
import { useRegisterBackNavigationHandler } from "next-page-router-back-navigation-guard";
import { openConfirmDialog } from "@/components/ConfirmDialog";

export default function PreRegisteredTest() {
  const router = useRouter();

  // @ts-expect-error - async handler is supported internally
  useRegisterBackNavigationHandler(async () => {
    return openConfirmDialog({
      title: "Regular Handler",
      description: "This is a regular handler. If you see this, preRegisteredHandler returned true.",
    });
  });

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <h1>Test: Pre-registered Handler</h1>
      <p data-testid="page-indicator">Current Page: pre-registered</p>
      <p>
        This page has a regular handler. To test preRegisteredHandler, wrap your
        app with a BackNavigationHandlerProvider that has a preRegisteredHandler.
      </p>
      <p>
        The preRegisteredHandler runs FIRST (highest priority). If it returns
        false, other handlers dont run.
      </p>

      <div style={{ marginTop: 20 }}>
        <Link href="/">Back to Home</Link>
      </div>

      <div style={{ marginTop: 20 }}>
        <button onClick={() => router.back()} data-testid="back-button">
          router.back()
        </button>
      </div>
    </div>
  );
}
