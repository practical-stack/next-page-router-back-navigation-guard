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
      <p>This tests the default handler behavior (override: false, once: false, enable: true)</p>

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
