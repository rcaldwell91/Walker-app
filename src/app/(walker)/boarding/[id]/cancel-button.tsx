"use client";

import { useState, useTransition } from "react";
import { cancelStay } from "../actions";

/** Two taps to cancel: the first one arms it. */
export function CancelStayButton({ stayId }: { stayId: string }) {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => (armed ? start(() => cancelStay(stayId)) : setArmed(true))}
      className={`min-h-11 w-full rounded-xl px-3 text-sm ${armed ? "bg-warn font-medium text-warn-fg" : "text-muted underline"}`}
      data-cancel-stay
    >
      {pending ? "Cancelling…" : armed ? "Tap again to cancel this stay" : "Cancel this stay"}
    </button>
  );
}
