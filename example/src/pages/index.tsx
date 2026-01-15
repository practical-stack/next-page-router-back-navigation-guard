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
            <li><Link href="/redirect">Redirect on Back</Link></li>
          </ul>
        </div>
      </main>
    </div>
  );
}
