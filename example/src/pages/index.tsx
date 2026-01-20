import Link from "next/link";

export default function Home() {
  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif", maxWidth: 800 }}>
      <main>
        <h1>next-page-router-back-navigation-guard Example</h1>

        <div style={{ marginTop: 20, padding: 15, background: "#e3f2fd", borderRadius: 8 }}>
          <p style={{ margin: 0, fontSize: 14 }}>
            <strong>Note:</strong> This is the entry page. Back button handling does not work here
            because there is no forward history to restore. Navigate to any test page first,
            then press back to see the handler in action.
          </p>
        </div>

        <div style={{ marginTop: 20 }}>
          <h3>Test Scenarios:</h3>
          <ul style={{ lineHeight: 2 }}>
            <li>
              <Link href="/basic">Basic Handler</Link>
              <span style={{ fontSize: 13, color: "#666" }}> — Show confirm dialog, block on cancel, allow on confirm</span>
            </li>
            <li>
              <Link href="/once">Once Option</Link>
              <span style={{ fontSize: 13, color: "#666" }}> — Handler executes once then auto-unregisters</span>
            </li>
            <li>
              <Link href="/enable">Enable Option</Link>
              <span style={{ fontSize: 13, color: "#666" }}> — Conditionally enable/disable handler</span>
            </li>
            <li>
              <Link href="/override">Override Handlers</Link>
              <span style={{ fontSize: 13, color: "#666" }}> — Multiple handlers with priority (lower runs first)</span>
            </li>
            <li>
              <Link href="/priority">Priority Order</Link>
              <span style={{ fontSize: 13, color: "#666" }}> — Non-override handlers with priority ordering</span>
            </li>
            <li>
              <Link href="/pre-registered">Pre-registered Handler</Link>
              <span style={{ fontSize: 13, color: "#666" }}> — Global handler via Provider prop (e.g., close modals)</span>
            </li>
            <li>
              <Link href="/nohandler">No Handler</Link>
              <span style={{ fontSize: 13, color: "#666" }}> — Page without handler (normal back navigation)</span>
            </li>
            <li>
              <Link href="/redirect-safe">Safe Redirect Pattern</Link>
              <span style={{ fontSize: 13, color: "#666" }}> — Block back, show modal, redirect on confirm (recommended)</span>
            </li>
          </ul>
        </div>

        <div style={{ marginTop: 20, padding: 15, background: "#fff3e0", borderRadius: 8 }}>
          <h3 style={{ margin: "0 0 10px 0" }}>Known Limitations:</h3>
          <ul style={{ margin: 0, lineHeight: 2 }}>
            <li>
              <Link href="/redirect" style={{ color: "#e65100" }}>
                Redirect on Back (NOT SUPPORTED)
              </Link>
              <span style={{ fontSize: 13, color: "#666" }}> — router.push() inside handler causes unpredictable behavior</span>
            </li>
            <li style={{ color: "#666", fontSize: 14 }}>
              Entry page (this page) cannot block back — no forward history to restore
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
}
