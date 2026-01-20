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
      <p data-testid="enable-status">Handler enabled: {enabled ? "Yes" : "No"}</p>

      <div style={{ background: "#e3f2fd", padding: 15, borderRadius: 8, marginTop: 15 }}>
        <h4 style={{ margin: "0 0 10px 0" }}>What this tests:</h4>
        <p style={{ margin: "0 0 10px 0" }}>
          The <code>enable</code> option - conditionally register/unregister handler.
        </p>
        <h4 style={{ margin: "10px 0" }}>Expected behavior:</h4>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>When enabled: Back → Dialog appears</li>
          <li>When disabled: Back → Navigates directly (no interception)</li>
        </ul>
        <h4 style={{ margin: "10px 0" }}>Use case:</h4>
        <p style={{ margin: 0, fontSize: 14, color: "#1565c0" }}>
          Enable guard only when form has unsaved changes: <code>{"{ enable: isDirty }"}</code>
        </p>
      </div>

      <div style={{ marginTop: 20 }}>
        <button
          onClick={() => setEnabled(!enabled)}
          data-testid="toggle-enable"
          style={{
            backgroundColor: enabled ? "#4caf50" : "#f44336",
            color: "white",
            padding: "8px 16px",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          {enabled ? "Disable Handler" : "Enable Handler"}
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
