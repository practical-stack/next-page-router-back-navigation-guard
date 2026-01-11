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
      <p>This tests override handlers. Multiple override handlers can coexist with different priorities.</p>
      <p data-testid="handler2-status">Handler 2 active: {showHandler2 ? "Yes" : "No"}</p>

      <OverrideHandler1 />
      {showHandler2 && <OverrideHandler2 />}

      <div style={{ marginTop: 20 }}>
        <button
          onClick={() => setShowHandler2(!showHandler2)}
          data-testid="toggle-handler2"
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
