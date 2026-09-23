"use client";

import { useState } from "react";

/** 1–5 picker with big tap targets. Submits `name` as a number. */
export function ScoreInput({ name, label, low, high }: { name: string; label: string; low?: string; high?: string }) {
  const [value, setValue] = useState<number | null>(null);
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-5 gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border-2 text-lg font-semibold ${
              value === n ? "border-accent bg-accent text-accent-fg" : "border-border bg-card"
            }`}
          >
            <input type="radio" name={name} value={n} checked={value === n} onChange={() => setValue(n)} className="sr-only" required />
            {n}
          </label>
        ))}
      </div>
      {low || high ? (
        <div className="mt-1 flex justify-between text-xs text-muted">
          <span>{low}</span>
          <span>{high}</span>
        </div>
      ) : null}
    </fieldset>
  );
}

export function Stars({ score }: { score: number }) {
  return (
    <span aria-label={`${score} out of 5`} className="tracking-tight">
      {"★".repeat(Math.round(score))}
      <span className="text-muted">{"★".repeat(5 - Math.round(score))}</span>
    </span>
  );
}
