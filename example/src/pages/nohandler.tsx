import Link from "next/link";
import { useRouter } from "next/router";

export default function NoHandlerTest() {
  const router = useRouter();

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <h1>Test: No Handler</h1>
      <p data-testid="page-indicator">Current Page: nohandler</p>

      <div style={{ background: "#e3f2fd", padding: 15, borderRadius: 8, marginTop: 15 }}>
        <h4 style={{ margin: "0 0 10px 0" }}>What this tests:</h4>
        <p style={{ margin: "0 0 10px 0" }}>
          Page without any <code>useRegisterBackNavigationHandler</code> call.
        </p>
        <h4 style={{ margin: "10px 0" }}>Expected behavior:</h4>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Back navigation works normally (no interception)</li>
          <li>No dialog appears</li>
          <li>Navigates directly to previous page</li>
        </ul>
        <h4 style={{ margin: "10px 0" }}>Note:</h4>
        <p style={{ margin: 0, fontSize: 14, color: "#1565c0" }}>
          If an open dialog exists, <code>preRegisteredHandler</code> may still close it.
        </p>
      </div>

      <div style={{ marginTop: 20 }}>
        <Link href="/">Back to Home</Link>
        {" | "}
        <Link href="/basic">Go to Basic Handler</Link>
      </div>

      <div style={{ marginTop: 20 }}>
        <button onClick={() => router.back()} data-testid="back-button">
          router.back()
        </button>
      </div>
    </div>
  );
}
