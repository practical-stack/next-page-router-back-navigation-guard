import Link from "next/link";

export default function Home() {
  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <main>
        <h1>next-page-router-back-navigation-guard Example</h1>

        <div style={{ marginTop: 20 }}>
          <h3>Test Scenarios:</h3>
          <ul>
            <li><Link href="/basic">Basic Handler</Link></li>
            <li><Link href="/once">Once Option</Link></li>
            <li><Link href="/enable">Enable Option</Link></li>
            <li><Link href="/override">Override Handlers</Link></li>
            <li><Link href="/priority">Priority Order</Link></li>
            <li><Link href="/pre-registered">Pre-registered Handler</Link></li>
            <li><Link href="/nohandler">No Handler (no interception)</Link></li>
          </ul>
        </div>

        <div style={{ marginTop: 20, padding: 15, background: "#fff3e0", borderRadius: 8 }}>
          <h3 style={{ margin: "0 0 10px 0" }}>Known Limitations:</h3>
          <ul style={{ margin: 0 }}>
            <li>
              <Link href="/redirect" style={{ color: "#e65100" }}>
                Redirect on Back (NOT RECOMMENDED)
              </Link>
              <span style={{ fontSize: 12, color: "#666" }}> - router.push() inside handler has issues</span>
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
}
