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
      <p>This tests the once: true option. Handler should only execute once.</p>
      <p data-testid="execution-count">Handler executed: {executionCount} time(s)</p>

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
