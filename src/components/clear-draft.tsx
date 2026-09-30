"use client";

import { useEffect } from "react";

/** Once a walk is finished, its wrap-up draft on this phone is done with. */
export function ClearDraft({ storageKey }: { storageKey: string }) {
  useEffect(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  }, [storageKey]);
  return null;
}
