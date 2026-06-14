/**
 * Pending Handler Restore
 *
 * After a back navigation we restore the URL with history.go(-delta) and defer the handler
 * until that restore completes. This holds the in-flight restore: the delta to replay once
 * the handler approves, or null when nothing is pending.
 *
 * Modeling it as a single nullable value (rather than a boolean paired with a separate
 * number) keeps the two from drifting out of sync and makes "consume exactly once" explicit.
 */

export interface PendingRestore {
  /** Index delta to replay via history.go() once the handler approves. */
  delta: number;
}

export function createPendingHandlerRestore() {
  let pending: PendingRestore | null = null;

  return {
    /** Mark a restore as pending for the given back-navigation delta. */
    setPending: (delta: number): void => {
      pending = { delta };
    },

    /** True while a restore is awaiting its follow-up popstate. */
    isPending: (): boolean => pending !== null,

    /**
     * Atomically read and clear the pending restore. Returns null if nothing is pending,
     * so whichever trigger fires first (the follow-up popstate or the refresh-safe
     * fallback) wins and the other becomes a no-op.
     */
    consume: (): PendingRestore | null => {
      const current = pending;
      pending = null;
      return current;
    },
  };
}
