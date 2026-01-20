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

      <div style={{ background: "#e3f2fd", padding: 15, borderRadius: 8, marginTop: 15 }}>
        <h4 style={{ margin: "0 0 10px 0" }}>What this tests:</h4>
        <p style={{ margin: "0 0 10px 0" }}>
          The <code>preRegisteredHandler</code> prop on <code>BackNavigationHandlerProvider</code>.
        </p>
        <h4 style={{ margin: "10px 0" }}>How it works:</h4>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li><code>preRegisteredHandler</code> runs FIRST with highest priority</li>
          <li>If it returns <code>false</code> → Navigation blocked, other handlers skip</li>
          <li>If it returns <code>true</code> → Regular handlers run next</li>
        </ul>
        <h4 style={{ margin: "10px 0" }}>Expected behavior on this page:</h4>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Back → "Regular Handler" dialog appears</li>
          <li>(This means preRegisteredHandler returned true)</li>
        </ul>
        <h4 style={{ margin: "10px 0" }}>Use case:</h4>
        <p style={{ margin: 0, fontSize: 14, color: "#1565c0" }}>
          Close global modals/overlays before page handlers run. See <code>_app.tsx</code> for implementation.
        </p>
      </div>

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
