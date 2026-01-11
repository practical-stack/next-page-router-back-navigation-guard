import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { useRegisterBackNavigationHandler } from "next-page-router-back-navigation-guard";
import { openConfirmDialog } from "@/components/ConfirmDialog";

export default function EnableTest() {
  const router = useRouter();
  const [enabled, setEnabled] = useState(true);

  useRegisterBackNavigationHandler(
    // @ts-expect-error - async handler is supported internally
    async () => {
      return openConfirmDialog({
        title: "Leave Page?",
        description: "Enable option test - Handler is currently enabled.",
      });
    },
    { enable: enabled }
  );

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <h1>Test: Enable Option</h1>
      <p data-testid="page-indicator">Current Page: enable</p>
      <p>This tests the enable option. Toggle to enable/disable the handler.</p>
      <p data-testid="enable-status">Handler enabled: {enabled ? "Yes" : "No"}</p>

      <div style={{ marginTop: 20 }}>
        <button
          onClick={() => setEnabled(!enabled)}
          data-testid="toggle-enable"
        >
          Toggle Enable ({enabled ? "Disable" : "Enable"})
        </button>
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
