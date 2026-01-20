import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { useRegisterBackNavigationHandler } from "next-page-router-back-navigation-guard";
import { openConfirmDialog } from "@/components/ConfirmDialog";

function OverrideHandler1() {
  useRegisterBackNavigationHandler(
    // @ts-expect-error - async handler is supported internally
    async () => {
      return openConfirmDialog({
        title: "Override Handler 1",
        description: "This is override handler with priority 1 (default).",
      });
    },
    { override: true }
  );

  return null;
}

function OverrideHandler2() {
  useRegisterBackNavigationHandler(
    // @ts-expect-error - async handler is supported internally
    async () => {
      return openConfirmDialog({
        title: "Override Handler 2",
        description: "This is override handler with priority 2.",
      });
    },
    { override: true, overridePriority: 2 }
  );

  return null;
}

export default function OverrideTest() {
  const router = useRouter();
  const [showHandler2, setShowHandler2] = useState(false);

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <h1>Test: Override Handlers</h1>
      <p data-testid="page-indicator">Current Page: override</p>
      <p data-testid="handler2-status">Handler 2 active: {showHandler2 ? "Yes" : "No"}</p>

      <OverrideHandler1 />
      {showHandler2 && <OverrideHandler2 />}

      <div style={{ background: "#e3f2fd", padding: 15, borderRadius: 8, marginTop: 15 }}>
        <h4 style={{ margin: "0 0 10px 0" }}>What this tests:</h4>
        <p style={{ margin: "0 0 10px 0" }}>
          The <code>override: true</code> option - allows multiple handlers with different priorities.
        </p>
        <h4 style={{ margin: "10px 0" }}>Current handlers:</h4>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Handler 1: <code>overridePriority: 1</code> (default) - Always active</li>
          <li>Handler 2: <code>overridePriority: 2</code> - Toggle below</li>
        </ul>
        <h4 style={{ margin: "10px 0" }}>Expected behavior:</h4>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Lower priority number runs first (1 before 2)</li>
          <li>Back → "Override Handler 1" dialog appears (priority 1)</li>
          <li>Only one handler runs per back navigation</li>
        </ul>
      </div>

      <div style={{ marginTop: 20 }}>
        <button
          onClick={() => setShowHandler2(!showHandler2)}
          data-testid="toggle-handler2"
          style={{
            backgroundColor: showHandler2 ? "#4caf50" : "#f5f5f5",
            color: showHandler2 ? "white" : "black",
            padding: "8px 16px",
            border: "1px solid #ddd",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          {showHandler2 ? "Remove" : "Add"} Handler 2 (priority: 2)
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
