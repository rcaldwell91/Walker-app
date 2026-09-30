"use client";

import { useMemo, useState } from "react";
import { closest, miles, type LatLng } from "@/lib/geo/distance";
import { PARK_FEATURES, type Park } from "@/lib/parks";
import { Button, Select } from "@/components/ui";

/**
 * Pick a park for the walk, or tap "Suggest a park" for the closest to the last
 * pickup. "Show me another" cycles through the rest. Attribute chips narrow
 * the suggestions (shade, off-leash, water…).
 */
export function ParkPicker({ parks, from, value, onChange }: { parks: Park[]; from: LatLng | null; value: string; onChange: (id: string) => void }) {
  const [want, setWant] = useState<Set<string>>(new Set());
  const [suggesting, setSuggesting] = useState(false);
  const [i, setI] = useState(0);
  const matches = useMemo(() => {
    const ok = parks.filter((p) => [...want].every((f) => p.features.includes(f)));
    return from ? closest(from, ok, ok.length).map(({ item, d }) => ({ park: item, d })) : ok.map((park) => ({ park, d: null as number | null }));
  }, [parks, want, from]);
  const current = matches.length ? matches[i % matches.length] : null;
  const chosen = parks.find((p) => p.id === value) ?? null;

  function toggle(f: string) {
    const next = new Set(want);
    if (next.has(f)) next.delete(f);
    else next.add(f);
    setWant(next);
    setI(0);
  }

  if (!parks.length) {
    return <p className="text-sm text-muted">Add your parks and trails on the Map tab, and you can pick one here.</p>;
  }

  return (
    <div className="flex flex-col gap-3" data-park-picker>
      {chosen ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-accent bg-accent/10 px-3 py-2" data-park-chosen={chosen.name}>
          <span className="min-w-0">
            <span className="block font-medium">{chosen.name}</span>
            <span className="block truncate text-xs text-muted">{featureText(chosen)}</span>
          </span>
          <button type="button" className="min-h-11 shrink-0 px-2 text-sm text-accent underline" onClick={() => onChange("")}>
            Change
          </button>
        </div>
      ) : null}

      {!chosen ? (
        <>
          {suggesting ? (
            <>
              <p className="text-xs text-muted">Must have (optional)</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Must have">
                {PARK_FEATURES.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    aria-pressed={want.has(f.key)}
                    onClick={() => toggle(f.key)}
                    className={`min-h-11 rounded-full border px-3 text-sm ${want.has(f.key) ? "border-accent bg-accent text-accent-fg" : "border-border bg-card"}`}
                    data-want={f.key}
                  >
                    {f.icon} {f.label}
                  </button>
                ))}
              </div>

              {current ? (
              <div className="rounded-xl border border-border bg-bg p-3" data-suggestion={current.park.name}>
                <p className="font-medium">{current.park.name}</p>
                <p className="text-sm text-muted">
                  {current.d != null ? `${miles(current.d).toFixed(1)} mi from the last pickup` : "Add client addresses to sort by distance"}
                  {matches.length > 1 ? ` · ${(i % matches.length) + 1} of ${matches.length}` : ""}
                </p>
                {current.park.features.length ? <p className="mt-1 text-xs text-muted">{featureText(current.park)}</p> : null}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button type="button" variant="secondary" disabled={matches.length < 2} onClick={() => setI(i + 1)} data-another>
                    Show me another
                  </Button>
                  <Button type="button" onClick={() => onChange(current.park.id)} data-pick-park>
                    Go here
                  </Button>
                </div>
              </div>
              ) : (
                <p className="text-sm text-muted">No parks have all of those. Tap a chip to loosen it.</p>
              )}
            </>
          ) : (
            <Button type="button" variant="secondary" onClick={() => setSuggesting(true)} data-suggest-park>
              Suggest a park
            </Button>
          )}

          <Select value="" onChange={(e) => e.target.value && onChange(e.target.value)} aria-label="Or pick any park">
            <option value="">Or pick any park…</option>
            {parks.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </>
      ) : null}
    </div>
  );
}

export function featureText(p: Park) {
  return PARK_FEATURES.filter((f) => p.features.includes(f.key))
    .map((f) => `${f.icon} ${f.label}`)
    .join(" · ");
}
