import Link from "next/link";
import { useRouter } from "next/router";
import { useRegisterBackNavigationHandler } from "next-page-router-back-navigation-guard";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { overlay } from "overlay-kit";

interface RedirectModalProps {
  isOpen: boolean;
  close: () => void;
  onConfirm: () => void;
}

function RedirectModal({ isOpen, close, onConfirm }: RedirectModalProps) {
  if (!isOpen) return null;

  return (
    <AlertDialog.Root open={true}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            zIndex: 1000,
          }}
        />
        <AlertDialog.Popup
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            backgroundColor: "white",
            padding: "24px",
            borderRadius: "8px",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
            zIndex: 1001,
            minWidth: "300px",
          }}
        >
          <AlertDialog.Title
            style={{
              margin: 0,
              fontSize: "18px",
              fontWeight: 600,
            }}
          >
            Redirect Notice
          </AlertDialog.Title>
          <AlertDialog.Description
            style={{
              marginTop: "8px",
              color: "#666",
              fontSize: "14px",
            }}
          >
            Back navigation is blocked. Click confirm to go to No Handler page.
          </AlertDialog.Description>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "8px",
              marginTop: "20px",
            }}
          >
            <button
              onClick={() => {
                close();
                onConfirm();
              }}
              style={{
                padding: "8px 16px",
                border: "none",
                borderRadius: "4px",
                backgroundColor: "#1976d2",
                color: "white",
                cursor: "pointer",
              }}
              data-testid="redirect-confirm"
            >
              Go to No Handler
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export default function RedirectSafeTest() {
  const router = useRouter();

  useRegisterBackNavigationHandler(() => {
    overlay.open(({ isOpen, close }) => (
      <RedirectModal
        isOpen={isOpen}
        close={close}
        onConfirm={() => router.push("/nohandler")}
      />
    ));
    return false;
  });

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <h1>Test: Safe Redirect Pattern</h1>
      <p data-testid="page-indicator">Current Page: redirect-safe</p>

      <div
        style={{
          background: "#e8f5e9",
          border: "2px solid #4caf50",
          padding: 15,
          borderRadius: 8,
          marginTop: 20,
        }}
      >
        <h3 style={{ color: "#2e7d32", margin: "0 0 10px 0" }}>
          ✅ RECOMMENDED - Safe Redirect Pattern
        </h3>
        <p style={{ margin: "0 0 10px 0" }}>
          This pattern safely redirects on back navigation without browser
          issues.
        </p>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Handler returns <code>false</code> immediately (no async)</li>
          <li>Modal opens via <code>overlay.open()</code> (not openAsync)</li>
          <li>
            <code>router.push()</code> is called from button click (outside
            handler)
          </li>
          <li>Works reliably after page refresh</li>
        </ul>
      </div>

      <div
        style={{
          background: "#e3f2fd",
          padding: 15,
          borderRadius: 8,
          marginTop: 20,
        }}
      >
        <h4 style={{ margin: "0 0 10px 0" }}>How it works:</h4>
        <pre
          style={{
            background: "#f5f5f5",
            padding: 10,
            borderRadius: 4,
            overflow: "auto",
            fontSize: 12,
          }}
        >
          {`useRegisterBackNavigationHandler(() => {
  // 1. Open modal (fire-and-forget, no await)
  overlay.open(({ isOpen, close }) => (
    <RedirectModal
      isOpen={isOpen}
      close={close}
      onConfirm={() => router.push("/nohandler")}  // 3. User clicks → navigate
    />
  ));
  
  // 2. Return immediately - handler is DONE
  return false;
});`}
        </pre>
      </div>

      <div
        style={{
          background: "#fff3e0",
          padding: 15,
          borderRadius: 8,
          marginTop: 20,
        }}
      >
        <h4 style={{ margin: "0 0 10px 0" }}>Why this is safe:</h4>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li>
            Handler returns <code>false</code> synchronously → back navigation
            blocked
          </li>
          <li>Modal is displayed to user</li>
          <li>
            User clicks button → <code>router.push()</code> is a{" "}
            <strong>new user-initiated navigation</strong>
          </li>
          <li>This is NOT inside the handler context anymore</li>
          <li>Browser treats it as a legitimate navigation</li>
        </ol>
      </div>

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
