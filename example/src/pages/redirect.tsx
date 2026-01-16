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
      <p>When back is pressed, this redirects to /nohandler (which has NO handler).</p>

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
