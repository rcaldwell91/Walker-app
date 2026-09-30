"use client";

import { useEffect, useState } from "react";

/**
 * Something failed while loading or tapping (most often: no signal). One plain
 * line and a way to try again; the bottom tabs stay, so there's always a way out.
 */
export default function ErrorScreen({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    setOffline(!navigator.onLine);
    const on = () => reset();
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, [reset]);
  return (
    <div className="flex flex-col items-center gap-4 pt-16 text-center" data-error-screen>
      <h1 className="text-xl font-semibold">{offline ? "No signal" : "That didn't load"}</h1>
      <p className="text-muted">{offline ? "It'll load again when you're back in range." : "Try again in a moment."}</p>
      <button type="button" onClick={reset} className="btn h-14 w-full rounded-xl bg-accent px-4 text-lg font-medium text-accent-fg">
        Try again
      </button>
    </div>
  );
}
