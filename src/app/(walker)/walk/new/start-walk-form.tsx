"use client";

import { useActionState, useState } from "react";
import { startWalk } from "../actions";
import { Button, ErrorText, Field, Select } from "@/components/ui";

type Dog = { id: string; name: string; working_on: string; clientName: string; color: string | null; group: string | null };

export function StartWalkForm({
  dogs,
  services,
  trails,
}: {
  dogs: Dog[];
  services: { id: string; name: string; category: string }[];
  trails: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(startWalk, undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const groups = Array.from(new Set(dogs.map((d) => d.group).filter(Boolean))) as string[];

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }
  function selectGroup(g: string) {
    const ids = dogs.filter((d) => d.group === g).map((d) => d.id);
    const all = ids.every((id) => selected.has(id));
    const next = new Set(selected);
    ids.forEach((id) => (all ? next.delete(id) : next.add(id)));
    setSelected(next);
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {groups.length ? (
        <div className="flex flex-wrap gap-2">
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => selectGroup(g)}
              className="rounded-full border border-border bg-card px-3 py-1 text-sm"
            >
              {g}
            </button>
          ))}
        </div>
      ) : null}

      <ul className="grid grid-cols-2 gap-2">
        {dogs.map((d) => {
          const on = selected.has(d.id);
          return (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => toggle(d.id)}
                className={`flex w-full flex-col items-start rounded-2xl border-2 p-3 text-left ${
                  on ? "border-accent bg-accent/10" : "border-border bg-card"
                }`}
              >
                <span className="flex items-center gap-2 font-medium">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color ?? "var(--border)" }} />
                  {d.name}
                </span>
                <span className="text-xs text-muted">{d.clientName}</span>
              </button>
              {on ? <input type="hidden" name="dog_id" value={d.id} /> : null}
            </li>
          );
        })}
      </ul>

      <Field label="Service">
        <Select name="service_type_id" defaultValue={services[0]?.id} required>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Trail" hint="Optional. Add your usual spots under Map.">
        <Select name="trail_id" defaultValue="">
          <option value="">Not sure yet</option>
          {trails.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>

      <ErrorText>{state?.error}</ErrorText>
      <Button type="submit" disabled={pending || selected.size === 0} className="h-14 text-lg">
        {selected.size ? `Start with ${selected.size} dog${selected.size > 1 ? "s" : ""}` : "Pick your dogs"}
      </Button>
    </form>
  );
}
