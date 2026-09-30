"use client";

import { useState, useTransition } from "react";
import { cancelStay } from "../actions";
import { errorOf, tap } from "@/lib/offline";

/** Two taps to cancel: the first one arms it. */
export function CancelStayButton({ stayId }: { stayId: string }) {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        armed
          ? start(async () => {
              setErr(errorOf(await tap(() => cancelStay(stayId))));
            })
          : setArmed(true)
      }
      className={`min-h-11 w-full rounded-xl px-3 text-sm ${armed ? "bg-warn font-medium text-warn-fg" : "text-muted underline"}`}
      data-cancel-stay
    >
      {pending ? "Cancelling…" : armed ? "Tap again to cancel this stay" : "Cancel this stay"}
    </button>
    <p className="min-h-5 text-center text-sm text-warn" role="status">
      {err}
    </p>
    </>
  );
}
