import Link from "next/link";
import { useRouter } from "next/router";

export default function NoHandlerTest() {
  const router = useRouter();

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <h1>Test: No Handler</h1>
      <p data-testid="page-indicator">Current Page: nohandler</p>
      <p>This page has NO back navigation handler registered.</p>
      <p>Back navigation should work normally without any interception.</p>

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
