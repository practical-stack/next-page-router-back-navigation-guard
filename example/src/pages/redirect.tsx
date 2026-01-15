import Link from "next/link";
import { useRouter } from "next/router";
import { useRegisterBackNavigationHandler } from "next-page-router-back-navigation-guard";

export default function RedirectTest() {
  const router = useRouter();

  useRegisterBackNavigationHandler(() => {
    router.push("/once");
    return false;
  });

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <h1>Test: Redirect on Back</h1>
      <p data-testid="page-indicator">Current Page: redirect</p>
      <p>This tests redirecting to a different page (/once) when back button is pressed.</p>
      <p>The handler calls router.push("/once") and returns false.</p>

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
