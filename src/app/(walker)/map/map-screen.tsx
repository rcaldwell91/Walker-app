"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { MapView, type MapPin } from "@/components/map-view";
import { Button, Card, ErrorText, Field, Input, LinkButton, SectionTitle } from "@/components/ui";
import { VoiceInput } from "@/components/voice-input";
import { ParkPicker, featureText } from "@/components/park-picker";
import { hasCoords, nearestNeighborOrder, type LatLng } from "@/lib/geo/distance";
import { PARK_FEATURES, type Park } from "@/lib/parks";
import { createPark, deletePark, findAddress, setParkFeatures } from "./actions";

type Client = {
  id: string;
  name: string;
  color: string | null;
  group: string | null;
  lat: number | null;
  lng: number | null;
  address: string;
  pets: { id: string; name: string }[];
};
type MapPark = Park & { own: boolean };

const ALL = "__all";
const NO_GROUP = "__none";

export function MapScreen({ clients, parks }: { clients: Client[]; parks: MapPark[] }) {
  const [group, setGroup] = useState(ALL);
  const [selected, setSelected] = useState<string | null>(null);
  const [newPark, setNewPark] = useState<LatLng | null>(null);
  const [going, setGoing] = useState<Set<string>>(new Set());
  const [parkId, setParkId] = useState("");
  const [here, setHere] = useState<LatLng | null>(null);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setHere({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }, []);

  const groups = Array.from(new Set(clients.map((c) => c.group).filter(Boolean))) as string[];
  const hasUngrouped = clients.some((c) => !c.group);
  const shown = useMemo(() => clients.filter((c) => group === ALL || (group === NO_GROUP ? !c.group : c.group === group)), [clients, group]);

  // Pickups for the pets going out: nearest first from where the walker is.
  const order = useMemo(
    () => nearestNeighborOrder(here, clients.filter((c) => c.pets.some((p) => going.has(p.id)))),
    [here, clients, going],
  );
  const lastPickup = [...order].reverse().find((c) => hasCoords(c)) ?? null;

  const pins = useMemo<MapPin[]>(() => {
    const stopNumber = new Map(order.map((c, i) => [c.id, i + 1]));
    const out: MapPin[] = [];
    for (const c of shown) {
      if (c.lat == null || c.lng == null) continue;
      const n = stopNumber.get(c.id);
      out.push({ id: `client:${c.id}`, lat: c.lat, lng: c.lng, kind: n ? "stop" : "client", color: c.color, label: n ? String(n) : c.name });
    }
    for (const p of parks) out.push({ id: `park:${p.id}`, lat: p.lat, lng: p.lng, kind: "trail", color: null, label: p.id === parkId ? `${p.name} ✓` : p.name });
    if (newPark) out.push({ id: "park:new", lat: newPark.lat, lng: newPark.lng, kind: "trail", color: null, label: "New park" });
    if (here) out.push({ id: "me", lat: here.lat, lng: here.lng, kind: "me", label: "You" });
    return out;
  }, [shown, parks, newPark, here, parkId, order]);

  const [kind, id] = selected?.split(":") ?? [];
  const client = kind === "client" ? clients.find((c) => c.id === id) : null;
  const park = kind === "park" ? parks.find((p) => p.id === id) : null;
  const unplaced = shown.filter((c) => c.lat == null || c.lng == null);

  function togglePet(petId: string) {
    const next = new Set(going);
    if (next.has(petId)) next.delete(petId);
    else next.add(petId);
    setGoing(next);
  }
  function toggleClient(c: Client) {
    const all = c.pets.every((p) => going.has(p.id));
    const next = new Set(going);
    c.pets.forEach((p) => (all ? next.delete(p.id) : next.add(p.id)));
    setGoing(next);
  }

  const chip = (value: string, label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setGroup(value)}
      aria-pressed={group === value}
      className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium ${group === value ? "border-accent bg-accent text-accent-fg" : "border-border bg-card"}`}
    >
      {label}
    </button>
  );

  const startHref = `/walk/new?dogs=${[...going].join(",")}${parkId ? `&park=${parkId}` : ""}`;

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
        className="h-[45dvh]"
        onPinClick={(pinId) => {
          if (pinId === "park:new" || pinId === "me") return;
          setNewPark(null);
          setSelected(pinId);
        }}
        onMapClick={(at) => {
          setSelected(null);
          setNewPark(at);
        }}
      />
      <p className="flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full bg-accent" /> Clients
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rotate-45 bg-[#5b4636]" /> Parks & trails
        </span>
        <span>Tap the map to add a park.</span>
      </p>

      {newPark ? <AddParkForm at={newPark} onDone={(savedId) => { setNewPark(null); if (savedId) setSelected(`park:${savedId}`); }} /> : null}

      {client ? (
        <Card data-client-card={client.name}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-medium">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: client.color ?? "var(--border)" }} />
                {client.name}
              </p>
              {client.address ? <p className="text-sm text-muted">{client.address}</p> : null}
              <p className="mt-1 text-sm">{client.pets.length ? client.pets.map((p) => p.name).join(", ") : "No pets yet"}</p>
              {client.group ? <p className="text-xs text-muted">{client.group}</p> : null}
            </div>
            <Link href={`/clients/${client.id}`} className="flex min-h-11 shrink-0 items-center px-2 text-sm text-accent">
              Open ›
            </Link>
          </div>
          {client.pets.length ? (
            <Button variant="secondary" className="mt-3 w-full" onClick={() => toggleClient(client)}>
              {client.pets.every((p) => going.has(p.id)) ? "Not going out" : `Take ${client.pets.map((p) => p.name).join(" & ")} out`}
            </Button>
          ) : null}
        </Card>
      ) : null}

      {park ? <ParkCard park={park} planned={parkId === park.id} onPlan={() => setParkId(park.id)} onGone={() => setSelected(null)} /> : null}

      <SectionTitle>Plan a walk</SectionTitle>
      <Card className="flex flex-col gap-4" data-plan>
        <div>
          <p className="mb-2 text-sm font-medium">Who&apos;s going out?</p>
          {clients.some((c) => c.pets.length) ? (
            <div className="flex flex-wrap gap-2">
              {clients.flatMap((c) =>
                c.pets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={going.has(p.id)}
                    onClick={() => togglePet(p.id)}
                    className={`flex min-h-11 items-center gap-2 rounded-full border-2 px-3 text-sm font-medium ${going.has(p.id) ? "border-accent bg-accent/10" : "border-border bg-bg"}`}
                    data-going={p.name}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color ?? "var(--border)" }} />
                    {p.name}
                  </button>
                )),
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">Add clients and their pets first.</p>
          )}
          {order.length ? (
            <p className="mt-2 text-xs text-muted" data-pickup-order>
              Pickups: {order.map((c, i) => `${i + 1}. ${c.name}`).join(" → ")}
              {here ? "" : " (turn on location to start from where you are)"}
            </p>
          ) : null}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Where to?</p>
          <ParkPicker parks={parks} from={lastPickup && hasCoords(lastPickup) ? { lat: lastPickup.lat, lng: lastPickup.lng } : here} value={parkId} onChange={setParkId} />
        </div>

        {going.size ? (
          <LinkButton href={startHref} className="h-14 text-lg" data-plan-start>
            Start the walk · {going.size} pet{going.size === 1 ? "" : "s"}
          </LinkButton>
        ) : (
          <p className="text-center text-sm text-muted">Tap the pets going out to start a walk from here.</p>
        )}
      </Card>

      <SectionTitle>Add a park</SectionTitle>
      <AddressSearch onFound={(at) => { setSelected(null); setNewPark(at); }} />

      {unplaced.length ? (
        <Card>
          <p className="mb-1 text-sm font-medium">Not on the map yet</p>
          <p className="mb-2 text-xs text-muted">Add an address and they&apos;ll show up here.</p>
          <ul className="flex flex-col">
            {unplaced.map((c) => (
              <li key={c.id}>
                <Link href={`/clients/${c.id}/edit`} className="flex min-h-11 items-center text-sm text-accent">
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

function FeatureChips({ value, onToggle }: { value: string[]; onToggle: (key: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="What it has">
      {PARK_FEATURES.map((f) => {
        const on = value.includes(f.key);
        return (
          <button
            key={f.key}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(f.key)}
            className={`min-h-11 rounded-full border px-3 text-sm ${on ? "border-accent bg-accent text-accent-fg" : "border-border bg-bg"}`}
            data-feature={f.key}
          >
            {f.icon} {f.label}
          </button>
        );
      })}
    </div>
  );
}

function AddParkForm({ at, onDone }: { at: LatLng; onDone: (savedId?: string) => void }) {
  const [state, action, pending] = useActionState(createPark, undefined);
  const [features, setFeatures] = useState<string[]>([]);
  useEffect(() => {
    if (state?.savedId) onDone(state.savedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <Card>
      <form action={action} className="flex flex-col gap-3" data-add-park>
        <p className="font-medium">Add a park or trail here</p>
        <input type="hidden" name="lat" value={at.lat} />
        <input type="hidden" name="lng" value={at.lng} />
        {features.map((f) => (
          <input key={f} type="hidden" name="feature" value={f} />
        ))}
        <Field label="Name">
          <Input name="name" placeholder="e.g. Ridge loop" required autoFocus />
        </Field>
        <div>
          <p className="mb-1 text-sm font-medium">What it has</p>
          <FeatureChips value={features} onToggle={(k) => setFeatures((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]))} />
        </div>
        <Field label="Notes" hint="Optional. Rules, the best entrance, hazards.">
          <VoiceInput name="notes" rows={2} />
        </Field>
        <ErrorText>{state?.error}</ErrorText>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" onClick={() => onDone()}>
            Never mind
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save park"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ParkCard({ park, planned, onPlan, onGone }: { park: MapPark; planned: boolean; onPlan: () => void; onGone: () => void }) {
  const [features, setFeatures] = useState(park.features);
  const [pending, start] = useTransition();
  useEffect(() => setFeatures(park.features), [park.features]);
  return (
    <Card className="flex flex-col gap-3" data-park-card={park.name}>
      <div>
        <p className="flex items-center gap-2 font-medium">
          <span className="inline-block h-2.5 w-2.5 rotate-45 bg-[#5b4636]" />
          {park.name}
        </p>
        {park.address ? <p className="text-sm text-muted">{park.address}</p> : null}
        {park.notes ? <p className="mt-1 whitespace-pre-wrap text-sm">{park.notes}</p> : null}
      </div>
      {park.own ? (
        <FeatureChips
          value={features}
          onToggle={(k) => {
            const next = features.includes(k) ? features.filter((x) => x !== k) : [...features, k];
            setFeatures(next);
            start(() => setParkFeatures(park.id, next));
          }}
        />
      ) : features.length ? (
        <p className="text-sm text-muted">{featureText({ ...park, features })}</p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button variant={planned ? "secondary" : "primary"} onClick={onPlan} disabled={planned}>
          {planned ? "Planned ✓" : "Walk here"}
        </Button>
        {park.own ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await deletePark(park.id);
                onGone();
              })
            }
          >
            Remove
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function AddressSearch({ onFound }: { onFound: (at: LatLng) => void }) {
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          start(async () => {
            const r = await findAddress(q);
            if ("error" in r) setMsg(r.error);
            else {
              onFound(r);
              setQ("");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          });
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search an address or park name" aria-label="Search an address" />
        <ErrorText>{msg}</ErrorText>
        <Button type="submit" variant="secondary" disabled={pending || !q.trim()}>
          {pending ? "Finding…" : "Find it"}
        </Button>
        <p className="text-xs text-muted">Or tap the map where the park is.</p>
      </form>
    </Card>
  );
}
