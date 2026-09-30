"use client";

import { useState } from "react";
import { THEME_CHOICES, THEME_COOKIE, type ThemeChoice } from "@/lib/theme";

/** Match phone / Light / Dark. Applies instantly and remembers the choice on this device. */
export function ThemeToggle({ initial }: { initial: ThemeChoice }) {
  const [choice, setChoice] = useState<ThemeChoice>(initial);
  function pick(next: ThemeChoice) {
    setChoice(next);
    const root = document.documentElement;
    if (next === "system") delete root.dataset.theme;
    else root.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }
  return (
    <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-3 gap-1 rounded-2xl border border-border bg-bg p-1" data-theme-toggle={choice}>
      {THEME_CHOICES.map((c) => (
        <button
          key={c.value}
          type="button"
          role="radio"
          aria-checked={choice === c.value}
          onClick={() => pick(c.value)}
          className={`rounded-xl text-sm font-medium ${choice === c.value ? "bg-card text-fg shadow-card" : "text-muted"}`}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
