import Link from "next/link";
import { useRouter } from "next/router";
import { useRegisterBackNavigationHandler } from "next-page-router-back-navigation-guard";
import { openConfirmDialog } from "@/components/ConfirmDialog";

export default function BasicTest() {
  const router = useRouter();

  // @ts-expect-error - async handler is supported internally
  useRegisterBackNavigationHandler(async () => {
    return openConfirmDialog({
      title: "Leave Page?",
      description: "Basic handler test - Cancel to stay, Leave to go back.",
    });
  });

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <h1>Test: Basic Handler</h1>
      <p data-testid="page-indicator">Current Page: basic</p>

      <div style={{ background: "#e3f2fd", padding: 15, borderRadius: 8, marginTop: 15 }}>
        <h4 style={{ margin: "0 0 10px 0" }}>What this tests:</h4>
        <p style={{ margin: "0 0 10px 0" }}>
          Default handler behavior with <code>override: false</code>, <code>once: false</code>, <code>enable: true</code>
        </p>
        <h4 style={{ margin: "10px 0" }}>Expected behavior:</h4>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Press back → Dialog appears</li>
          <li>Click "Cancel" → Stay on page, dialog closes</li>
          <li>Click "Leave" → Navigate to previous page</li>
          <li>Handler runs every time back is pressed (not once)</li>
        </ul>
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
