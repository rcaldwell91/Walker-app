"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { startWalk } from "../actions";
import { Button, Card, ErrorText, Field, Select } from "@/components/ui";
import { closest, distanceM, etaMinutes, hasCoords, miles, nearestNeighborOrder, type LatLng } from "@/lib/geo/distance";
import { PickupOrder, type PickupRow } from "./pickup-order";

type Dog = { id: string; name: string; working_on: string; clientId: string; clientName: string; color: string | null; group: string | null };
type Stop = { id: string; name: string; color: string | null; lat: number | null; lng: number | null };
type Trail = { id: string; name: string; lat: number; lng: number };

export function StartWalkForm({
  dogs,
  stops,
  services,
  trails,
  ownTrailIds,
}: {
  dogs: Dog[];
  stops: Stop[];
  services: { id: string; name: string; category: string }[];
  trails: Trail[];
  ownTrailIds: string[];
}) {
  const [state, action, pending] = useActionState(startWalk, undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [here, setHere] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(true);
  const [manual, setManual] = useState<{ key: string; order: string[] } | null>(null);
  const [reordering, setReordering] = useState(false);
  const [trailId, setTrailId] = useState("");

  // Where the walker is right now, for the first leg of the pickup route.
  useEffect(() => {
    if (!navigator.geolocation) return setLocating(false);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setHere({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }, []);

  const groups = Array.from(new Set(dogs.map((d) => d.group).filter(Boolean))) as string[];

  // Clients to pick up, in the order their dogs were tapped.
  const clientIds = Array.from(new Set(dogs.filter((d) => selected.has(d.id)).map((d) => d.clientId)));
  const stopById = useMemo(() => new Map(stops.map((s) => [s.id, s])), [stops]);
  const key = clientIds.join(",");
  const suggested = useMemo(
    () => nearestNeighborOrder(here, key ? key.split(",").map((id) => stopById.get(id)!).filter(Boolean) : []).map((s) => s.id),
    [here, key, stopById],
  );
  const order = manual?.key === key ? manual.order : suggested;
  const isSuggested = order.join(",") === suggested.join(",");

  const rows: PickupRow[] = [];
  let prev: LatLng | null = here;
  for (const id of order) {
    const s = stopById.get(id)!;
    let detail = "No address on the map";
    if (hasCoords(s)) {
      if (prev) {
        const d = distanceM(prev, s);
        detail = `${miles(d).toFixed(1)} mi · ~${etaMinutes(d)} min${prev === here ? " from you" : ""}`;
      } else detail = "First stop";
      prev = s;
    }
    const names = dogs.filter((d) => d.clientId === id && selected.has(d.id)).map((d) => d.name);
    rows.push({ id, name: `${names.join(", ")} · ${s.name}`, color: s.color, detail });
  }

  // Up to 3 of the walker's own trails nearest the last pickup.
  const lastStop = [...order].reverse().map((id) => stopById.get(id)!).find((s) => s && hasCoords(s));
  const own = new Set(ownTrailIds);
  const nearby = lastStop && hasCoords(lastStop) ? closest(lastStop, trails.filter((t) => own.has(t.id)), 3) : [];

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
  function move(from: number, to: number) {
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setManual({ key, order: next });
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
                aria-pressed={on}
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

      {order.length ? (
        <Card>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="font-medium">Pickup order</p>
              <p className="text-xs text-muted">
                {locating
                  ? "Finding you…"
                  : !isSuggested
                    ? "Your order"
                    : here
                      ? "Closest first, starting from you"
                      : "Closest first. Turn on location to start from where you are."}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              {!isSuggested ? (
                <Button type="button" variant="ghost" className="px-2 text-sm" onClick={() => setManual(null)}>
                  Reset
                </Button>
              ) : null}
              {order.length > 1 ? (
                <Button type="button" variant="secondary" className="px-3 text-sm" onClick={() => setReordering(!reordering)}>
                  {reordering ? "Done" : "Reorder"}
                </Button>
              ) : null}
            </div>
          </div>
          <PickupOrder rows={rows} reordering={reordering} onMove={move} />
          {order.map((id) => (
            <input key={id} type="hidden" name="pickup_client_id" value={id} />
          ))}
        </Card>
      ) : null}

      <Field label="Service">
        <Select name="service_type_id" defaultValue={services[0]?.id} required>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>

      <div>
        <Field label="Trail" hint="Optional. Add your usual spots on the Map tab.">
          <Select name="trail_id" value={trailId} onChange={(e) => setTrailId(e.target.value)}>
            <option value="">Not sure yet</option>
            {trails.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        {nearby.length ? (
          <div className="mt-2">
            <p className="mb-1 text-xs text-muted">Near your last pickup</p>
            <div className="flex flex-wrap gap-2">
              {nearby.map(({ item: t, d }) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTrailId(t.id)}
                  aria-pressed={trailId === t.id}
                  className={`rounded-full border px-3 text-sm ${trailId === t.id ? "border-accent bg-accent/10" : "border-border bg-card"}`}
                >
                  {t.name} · {miles(d).toFixed(1)} mi
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <ErrorText>{state?.error}</ErrorText>
      <Button type="submit" disabled={pending || selected.size === 0} className="h-14 text-lg">
        {selected.size ? `Start with ${selected.size} dog${selected.size > 1 ? "s" : ""}` : "Pick your dogs"}
      </Button>
    </form>
  );
}
