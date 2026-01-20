import Link from "next/link";
import { useRouter } from "next/router";
import { useRegisterBackNavigationHandler } from "next-page-router-back-navigation-guard";

export default function RedirectTest() {
  const router = useRouter();

  useRegisterBackNavigationHandler(() => {
    router.push("/nohandler");
    return false;
  });

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <h1>Test: Redirect on Back</h1>
      <p data-testid="page-indicator">Current Page: redirect</p>

      <div style={{ 
        background: "#ffebee", 
        border: "2px solid #f44336",
        padding: 15, 
        borderRadius: 8, 
        marginTop: 20 
      }}>
        <h3 style={{ color: "#c62828", margin: "0 0 10px 0" }}>
          ⚠️ NOT RECOMMENDED - Known Limitations
        </h3>
        <p style={{ margin: "0 0 10px 0" }}>
          Using <code>router.push()</code> inside a handler is <strong>not supported</strong> and causes unpredictable behavior.
        </p>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>After page refresh, browser back button may not work as expected</li>
          <li><code>router.back()</code> API may work while browser back button fails</li>
          <li>Navigation may jump to unexpected pages due to session token mismatch</li>
        </ul>
      </div>

      <div style={{ 
        background: "#e3f2fd", 
        padding: 15, 
        borderRadius: 8, 
        marginTop: 20 
      }}>
        <h4 style={{ margin: "0 0 10px 0" }}>Test Steps to Reproduce Issue:</h4>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li>Press browser back → Redirects to /nohandler ✓</li>
          <li>Press browser back → Returns to this page ✓</li>
          <li><strong>Refresh this page</strong></li>
          <li>Press browser back → Redirects to /nohandler ✓</li>
          <li>Press browser back → <span style={{ color: "#c62828" }}>Goes to Home instead of this page ✗</span></li>
        </ol>
      </div>

      <div style={{ 
        background: "#e8f5e9", 
        padding: 15, 
        borderRadius: 8, 
        marginTop: 20 
      }}>
        <h4 style={{ margin: "0 0 10px 0" }}>Recommended Patterns Instead:</h4>
        <pre style={{ 
          background: "#f5f5f5", 
          padding: 10, 
          borderRadius: 4, 
          overflow: "auto",
          fontSize: 12 
        }}>
{`// ✅ Show confirmation dialog
useRegisterBackNavigationHandler(() => {
  return window.confirm('Leave page?');
});

// ✅ Close modal/overlay
useRegisterBackNavigationHandler(() => {
  if (isModalOpen) {
    closeModal();
    return false;
  }
  return true;
});

// ❌ DON'T: Route inside handler
useRegisterBackNavigationHandler(() => {
  router.push('/somewhere'); // NOT SUPPORTED
  return false;
});`}
        </pre>
      </div>

      <div style={{ marginTop: 20 }}>
        <Link href="/">Back to Home</Link>
      </div>

      <div style={{ marginTop: 20 }}>
        <button onClick={() => router.back()} data-testid="back-button">
          router.back()
        </button>
      </div>

      <p style={{ marginTop: 20, fontSize: 12, color: "#666" }}>
        See <a href="https://github.com/practical-stack/next-page-router-back-navigation-guard/blob/main/docs/07-limitation.md" target="_blank" rel="noopener noreferrer">
          Limitations documentation
        </a> for more details.
      </p>
    </div>
  );
}
