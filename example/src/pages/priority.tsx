import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { useRegisterBackNavigationHandler } from "next-page-router-back-navigation-guard";
import { openConfirmDialog } from "@/components/ConfirmDialog";

function PriorityHandler({ priority }: { priority: 0 | 1 | 2 | 3 }) {
  useRegisterBackNavigationHandler(
    // @ts-expect-error - async handler is supported internally
    async () => {
      return openConfirmDialog({
        title: `Priority ${priority} Handler`,
        description: `This handler has priority ${priority}. Lower number = higher priority.`,
      });
    },
    { override: true, overridePriority: priority }
  );

  return null;
}

export default function PriorityTest() {
  const router = useRouter();
  const [priorities, setPriorities] = useState<(0 | 1 | 2 | 3)[]>([1]);

  const addPriority = (p: 0 | 1 | 2 | 3) => {
    if (!priorities.includes(p)) {
      setPriorities([...priorities, p]);
    }
  };

  const removePriority = (p: 0 | 1 | 2 | 3) => {
    setPriorities(priorities.filter((x) => x !== p));
  };

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <h1>Test: Priority Order</h1>
      <p data-testid="page-indicator">Current Page: priority</p>
      <p>This tests priority order. Lower priority number runs first.</p>
      <p data-testid="active-priorities">
        Active priorities: {priorities.sort().join(", ") || "none"}
      </p>

      {priorities.map((p) => (
        <PriorityHandler key={p} priority={p} />
      ))}

      <div style={{ marginTop: 20, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {([0, 1, 2, 3] as const).map((p) => (
          <button
            key={p}
            onClick={() =>
              priorities.includes(p) ? removePriority(p) : addPriority(p)
            }
            data-testid={`toggle-priority-${p}`}
            style={{
              backgroundColor: priorities.includes(p) ? "#4caf50" : "#f5f5f5",
              color: priorities.includes(p) ? "white" : "black",
              padding: "8px 16px",
              border: "1px solid #ddd",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Priority {p} ({priorities.includes(p) ? "Active" : "Inactive"})
          </button>
        ))}
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
