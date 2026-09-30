"use client";

import { useEffect } from "react";

/** Once something is sent, its drafts on this phone are done with. */
export function ClearDraft({ storageKeys }: { storageKeys: string[] }) {
  const key = storageKeys.join("|");
  useEffect(() => {
    try {
      for (const k of key.split("|")) localStorage.removeItem(k);
    } catch {}
  }, [key]);
  return null;
}
