import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { useRegisterBackNavigationHandler } from "next-page-router-back-navigation-guard";
import { openConfirmDialog } from "@/components/ConfirmDialog";

export default function OnceTest() {
  const router = useRouter();
  const [executionCount, setExecutionCount] = useState(0);

  useRegisterBackNavigationHandler(
    // @ts-expect-error - async handler is supported internally
    async () => {
      setExecutionCount((c) => c + 1);
      return openConfirmDialog({
        title: "Leave Page?",
        description: "Once option test - This handler runs only once.",
      });
    },
    { once: true }
  );

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <h1>Test: Once Option</h1>
      <p data-testid="page-indicator">Current Page: once</p>
      <p data-testid="execution-count">Handler executed: {executionCount} time(s)</p>

      <div style={{ background: "#e3f2fd", padding: 15, borderRadius: 8, marginTop: 15 }}>
        <h4 style={{ margin: "0 0 10px 0" }}>What this tests:</h4>
        <p style={{ margin: "0 0 10px 0" }}>
          The <code>once: true</code> option - handler executes exactly once then auto-unregisters.
        </p>
        <h4 style={{ margin: "10px 0" }}>Expected behavior:</h4>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>1st back → Dialog appears, count shows 1</li>
          <li>Click "Cancel" → Dialog closes, handler is already unregistered</li>
          <li>2nd back → <code>preRegisteredHandler</code> closes any open dialog</li>
          <li>3rd back → No handler, navigates to Home</li>
        </ul>
        <h4 style={{ margin: "10px 0" }}>Key point:</h4>
        <p style={{ margin: 0, fontSize: 14, color: "#1565c0" }}>
          "once" means "execute once" regardless of return value, not "allow navigation once"
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
