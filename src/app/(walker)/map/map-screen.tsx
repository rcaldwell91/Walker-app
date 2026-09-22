"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { MapView, type MapPin } from "@/components/map-view";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";
import { VoiceInput } from "@/components/voice-input";
import type { LatLng } from "@/lib/geo/distance";
import { createTrail } from "./actions";

type Client = {
  id: string;
  name: string;
  color: string | null;
  group: string | null;
  lat: number | null;
  lng: number | null;
  address: string;
  dogs: string[];
};
type Trail = { id: string; name: string; lat: number; lng: number; notes: string | null; color: string | null; good_for_rain: boolean };

const ALL = "__all";
const NO_GROUP = "__none";

export function MapScreen({ clients, trails }: { clients: Client[]; trails: Trail[] }) {
  const [group, setGroup] = useState(ALL);
  const [selected, setSelected] = useState<string | null>(null);
  const [newTrail, setNewTrail] = useState<LatLng | null>(null);
  const [state, action, pending] = useActionState(createTrail, undefined);

  // After a trail saves, show it instead of the add form.
  useEffect(() => {
    if (state?.savedId) {
      setNewTrail(null);
      setSelected(`trail:${state.savedId}`);
    }
  }, [state]);

  const groups = Array.from(new Set(clients.map((c) => c.group).filter(Boolean))) as string[];
  const hasUngrouped = clients.some((c) => !c.group);
  const shown = clients.filter((c) => group === ALL || (group === NO_GROUP ? !c.group : c.group === group));

  const pins = useMemo<MapPin[]>(() => {
    const out: MapPin[] = [];
    for (const c of shown) {
      if (c.lat != null && c.lng != null) out.push({ id: `client:${c.id}`, lat: c.lat, lng: c.lng, kind: "client", color: c.color, label: c.name });
    }
    for (const t of trails) out.push({ id: `trail:${t.id}`, lat: t.lat, lng: t.lng, kind: "trail", color: t.color, label: t.name });
    if (newTrail) out.push({ id: "trail:new", lat: newTrail.lat, lng: newTrail.lng, kind: "trail", color: "#b3541e", label: "New trail" });
    return out;
  }, [shown, trails, newTrail]);

  const [kind, id] = selected?.split(":") ?? [];
  const client = kind === "client" ? clients.find((c) => c.id === id) : null;
  const trail = kind === "trail" ? trails.find((t) => t.id === id) : null;
  const unplaced = shown.filter((c) => c.lat == null || c.lng == null);

  const chip = (value: string, label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setGroup(value)}
      aria-pressed={group === value}
      className={`shrink-0 rounded-full border px-4 text-sm font-medium ${
        group === value ? "border-accent bg-accent text-accent-fg" : "border-border bg-card"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      {groups.length ? (
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter by group">
          {chip(ALL, "All")}
          {groups.map((g) => chip(g, g))}
          {hasUngrouped ? chip(NO_GROUP, "No group") : null}
        </div>
      ) : null}

      <MapView
        pins={pins}
        className="h-[55dvh]"
        onPinClick={(pinId) => {
          if (pinId === "trail:new") return;
          setNewTrail(null);
          setSelected(pinId);
        }}
        onMapClick={(at) => {
          setSelected(null);
          setNewTrail(at);
        }}
      />
      <p className="flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full bg-accent" /> Clients
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rotate-45 bg-[#5b4636]" /> Trails
        </span>
      </p>

      {newTrail ? (
        <Card>
          <form action={action} className="flex flex-col gap-3">
            <p className="font-medium">Add a trail here</p>
            <input type="hidden" name="lat" value={newTrail.lat} />
            <input type="hidden" name="lng" value={newTrail.lng} />
            <Field label="Name">
              <Input name="name" placeholder="e.g. Ridge loop" required autoFocus />
            </Field>
            <Field label="Notes" hint="Optional. Parking, water, shade, off-leash rules.">
              <VoiceInput name="notes" rows={2} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="good_for_rain" className="h-5 w-5" /> Good in the rain
            </label>
            <ErrorText>{state?.error}</ErrorText>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setNewTrail(null)}>
                Never mind
              </Button>
              <Button type="submit" className="flex-1" disabled={pending}>
                {pending ? "Saving…" : "Save trail"}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {client ? (
        <Card>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-medium">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: client.color ?? "var(--border)" }} />
                {client.name}
              </p>
              {client.address ? <p className="text-sm text-muted">{client.address}</p> : null}
              <p className="mt-1 text-sm">{client.dogs.length ? client.dogs.join(", ") : "No dogs yet"}</p>
              {client.group ? <p className="text-xs text-muted">{client.group}</p> : null}
            </div>
            <Link href={`/clients/${client.id}`} className="shrink-0 text-sm text-accent">
              Open ›
            </Link>
          </div>
        </Card>
      ) : null}

      {trail ? (
        <Card>
          <p className="flex items-center gap-2 font-medium">
            <span className="inline-block h-2.5 w-2.5 rotate-45" style={{ background: trail.color ?? "#5b4636" }} />
            {trail.name}
          </p>
          {trail.notes ? <p className="mt-1 whitespace-pre-wrap text-sm">{trail.notes}</p> : null}
          {trail.good_for_rain ? <p className="mt-1 text-xs text-muted">Good in the rain</p> : null}
        </Card>
      ) : null}

      {unplaced.length ? (
        <Card>
          <p className="mb-1 text-sm font-medium">Not on the map yet</p>
          <p className="mb-2 text-xs text-muted">Add an address and they&apos;ll show up here.</p>
          <ul className="flex flex-col gap-1 text-sm">
            {unplaced.map((c) => (
              <li key={c.id}>
                <Link href={`/clients/${c.id}/edit`} className="text-accent">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
