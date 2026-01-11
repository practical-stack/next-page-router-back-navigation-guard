import { AlertDialog } from "@base-ui/react/alert-dialog";
import { overlay } from "overlay-kit";

interface ConfirmDialogProps {
  isOpen: boolean;
  close: (result: boolean) => void;
  title?: string;
  description?: string;
}

function ConfirmDialogContent({
  isOpen,
  close,
  title = "Unsaved Changes",
  description = "You have unsaved changes that will be lost.",
}: ConfirmDialogProps) {
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
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description
            style={{
              marginTop: "8px",
              color: "#666",
              fontSize: "14px",
            }}
          >
            {description}
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
              onClick={() => close(false)}
              style={{
                padding: "8px 16px",
                border: "1px solid #ddd",
                borderRadius: "4px",
                backgroundColor: "white",
                cursor: "pointer",
              }}
              data-testid="confirm-dialog-cancel"
            >
              Cancel
            </button>
            <button
              onClick={() => close(true)}
              style={{
                padding: "8px 16px",
                border: "none",
                borderRadius: "4px",
                backgroundColor: "#dc3545",
                color: "white",
                cursor: "pointer",
              }}
              data-testid="confirm-dialog-confirm"
            >
              Leave
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/**
 * Opens a confirmation dialog using overlay-kit's async pattern.
 * Returns true if user confirms (wants to leave), false if cancelled.
 */
export async function openConfirmDialog(options?: {
  title?: string;
  description?: string;
}): Promise<boolean> {
  return overlay.openAsync<boolean>(({ isOpen, close }) => (
    <ConfirmDialogContent
      isOpen={isOpen}
      close={close}
      title={options?.title}
      description={options?.description}
    />
  ));
}
