"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addNote, logEvent, markPickup, saveGpsPoints, sendStatus } from "../actions";
import { Button, Card, ErrorText, LinkButton } from "@/components/ui";
import { VoiceInput } from "@/components/voice-input";
import { EVENT_EMOJI, EVENT_LABELS } from "@/lib/events";
import { fmtTime } from "@/lib/format";
import { useTimeZone } from "@/components/timezone-context";
import { MapView, type MapPin } from "@/components/map-view";
import { distanceM, etaMinutes, type LatLng } from "@/lib/geo/distance";

type Dog = {
  id: string;
  name: string;
  working_on: string;
  progress_summary: string;
  quirks: string | null;
  clientId: string;
  clientName: string;
  clientColor: string | null;
  homeNotes: string | null;
  clientLat: number | null;
  clientLng: number | null;
  picked_up_at: string | null;
  dropped_off_at: string | null;
};

export function LiveWalk({
  walk,
  dogs,
  events,
  notes,
  messages,
  initialLine,
}: {
  walk: { id: string; started_at: string; serviceName: string; trailName: string | null; buttons: string[]; pickupOrder: string[] };
  dogs: Dog[];
  events: { id: string; kind: string; note: string | null; at: string; dog_id: string | null }[];
  notes: { id: string; body: string; dog_id: string; created_at: string }[];
  messages: { id: string; kind: string; client_id: string; sent_at: string }[];
  initialLine: LatLng[];
}) {
  const tz = useTimeZone();
  const [pending, start] = useTransition();
  const [focusDog, setFocusDog] = useState<string | null>(dogs.length === 1 ? dogs[0].id : null);
  const [noteState, noteAction, notePending] = useActionState(addNote.bind(null, walk.id), undefined);
  const elapsed = useElapsed(walk.started_at);
  const gps = useGpsTracker(walk.id, initialLine);

  const focus = dogs.find((d) => d.id === focusDog) ?? null;
  // One row per client, in pickup order.
  const clients = useMemo(() => {
    const rank = (id: string) => {
      const i = walk.pickupOrder.indexOf(id);
      return i === -1 ? Infinity : i;
    };
    return Array.from(
      new Map(
        dogs.map((d) => [
          d.clientId,
          {
            id: d.clientId,
            name: d.clientName,
            color: d.clientColor,
            at: d.clientLat != null && d.clientLng != null ? { lat: d.clientLat, lng: d.clientLng } : null,
          },
        ]),
      ).values(),
    ).sort((a, b) => rank(a.id) - rank(b.id));
  }, [dogs, walk.pickupOrder]);
  // Straight-line ETA from where the walker is now. Real road routing comes later.
  const etaTo = (at: LatLng | null) => (gps.here && at ? etaMinutes(distanceM(gps.here, at)) : undefined);
  // Memoized: the timer re-renders this screen every second.
  const pins = useMemo<MapPin[]>(() => {
    const out: MapPin[] = clients.flatMap((c, i) =>
      c.at ? [{ id: `stop:${c.id}`, lat: c.at.lat, lng: c.at.lng, kind: "stop" as const, color: c.color, label: String(i + 1) }] : [],
    );
    if (gps.here) out.push({ id: "me", lat: gps.here.lat, lng: gps.here.lng, kind: "me", label: "You" });
    return out;
  }, [clients, gps.here]);
  const lastMsg = (clientId: string) => messages.filter((m) => m.client_id === clientId).sort((a, b) => b.sent_at.localeCompare(a.sent_at))[0];

  return (
    <div className="flex flex-col gap-4">
      {/* Timer header */}
      <Card className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">{walk.serviceName}{walk.trailName ? ` · ${walk.trailName}` : ""}</p>
          <p className="text-3xl font-semibold tabular-nums">{elapsed}</p>
        </div>
        <div className="text-right text-xs text-muted">
          <p>{gps.status}</p>
          {gps.distanceM ? <p>{(gps.distanceM / 1609).toFixed(2)} mi</p> : null}
        </div>
      </Card>

      <MapView pins={pins} line={gps.line} follow className="h-48" />

      {/* Dog picker: one tap to focus a dog and see what they're working on */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {dogs.length > 1 ? (
          <button
            type="button"
            onClick={() => setFocusDog(null)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium ${
              focusDog === null ? "border-accent bg-accent text-accent-fg" : "border-border bg-card"
            }`}
          >
            Everyone
          </button>
        ) : null}
        {dogs.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setFocusDog(d.id)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium ${
              focusDog === d.id ? "border-accent bg-accent text-accent-fg" : "border-border bg-card"
            } ${d.dropped_off_at ? "opacity-50" : ""}`}
          >
            {d.name}
          </button>
        ))}
      </div>

      {/* Pickup summary for the focused dog */}
      {focus ? (
        <Card className="border-accent/40">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium">{focus.name}</p>
              <p className="text-xs text-muted">{focus.clientName}</p>
            </div>
            <div className="flex gap-2">
              {!focus.picked_up_at ? (
                <Button variant="secondary" disabled={pending} onClick={() => start(() => markPickup(walk.id, focus.id, "picked_up_at"))}>
                  Picked up
                </Button>
              ) : !focus.dropped_off_at ? (
                <Button variant="secondary" disabled={pending} onClick={() => start(() => markPickup(walk.id, focus.id, "dropped_off_at"))}>
                  Dropped off
                </Button>
              ) : (
                <span className="text-sm text-muted">Home ✓</span>
              )}
            </div>
          </div>
          {focus.working_on ? (
            <p className="mt-2 text-sm">
              <span className="font-medium">Working on:</span> {focus.working_on}
            </p>
          ) : null}
          {focus.progress_summary ? <p className="mt-1 text-sm text-muted">{focus.progress_summary}</p> : null}
          {focus.quirks ? <p className="mt-1 text-sm text-warn">{focus.quirks}</p> : null}
          {focus.homeNotes ? (
            <p className="mt-1 text-sm" data-home-notes>
              <span className="font-medium">Home access:</span> {focus.homeNotes}
            </p>
          ) : null}
        </Card>
      ) : null}

      {/* One-tap buttons */}
      <div className="grid grid-cols-3 gap-2">
        {walk.buttons
          .filter((b) => b !== "note")
          .map((b) => (
            <button
              key={b}
              type="button"
              disabled={pending}
              onClick={() => start(() => logEvent(walk.id, b, focusDog))}
              className="flex h-20 flex-col items-center justify-center rounded-2xl border border-border bg-card text-sm font-medium active:scale-95"
            >
              <span className="text-2xl">{EVENT_EMOJI[b] ?? "•"}</span>
              {EVENT_LABELS[b] ?? b}
            </button>
          ))}
      </div>
      {focusDog === null && dogs.length > 1 ? (
        <p className="-mt-2 text-center text-xs text-muted">Logging for everyone. Tap a dog to log just for them.</p>
      ) : null}

      {/* Voice note */}
      <Card>
        <form action={noteAction} className="flex flex-col gap-2">
          <p className="text-sm font-medium">Note{focus ? ` on ${focus.name}` : ""}</p>
          {!focus ? (
            <select name="dog_id" className="rounded-xl border border-border bg-bg px-3 py-2" defaultValue="">
              <option value="" disabled>
                Which dog?
              </option>
              {dogs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          ) : (
            <input type="hidden" name="dog_id" value={focus.id} />
          )}
          <VoiceInput name="body" rows={2} placeholder="Tap the mic and talk. Or type." />
          <ErrorText>{noteState?.error}</ErrorText>
          <Button type="submit" variant="secondary" disabled={notePending}>
            Save note
          </Button>
        </form>
      </Card>

      {/* One-tap client messages */}
      <Card>
        <p className="mb-2 text-sm font-medium">Tell the owner</p>
        <ul className="flex flex-col gap-2">
          {clients.map(({ id: clientId, name, at }) => {
            const last = lastMsg(clientId);
            const eta = etaTo(at);
            return (
              <li key={clientId} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">{name}</p>
                  {eta ? <p className="text-xs text-muted">~{eta} min away</p> : null}
                  {last ? <p className="text-xs text-muted">Sent “{EVENT_LABELS[last.kind] ?? last.kind.replace("_", " ")}” {fmtTime(last.sent_at, tz)}</p> : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="secondary" className="px-3 text-xs" disabled={pending} onClick={() => start(() => sendStatus(walk.id, "on_my_way", clientId, etaTo(at)))}>
                    On my way
                  </Button>
                  <Button variant="secondary" className="px-3 text-xs" disabled={pending} onClick={() => start(() => sendStatus(walk.id, "here", clientId))}>
                    Here
                  </Button>
                  <Button variant="secondary" className="px-3 text-xs" disabled={pending} onClick={() => start(() => sendStatus(walk.id, "dropped_off", clientId))}>
                    Home
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Log so far */}
      {events.length || notes.length ? (
        <Card>
          <p className="mb-2 text-sm font-medium">So far</p>
          <ul className="flex flex-col gap-1 text-sm">
            {[...events.map((e) => ({ at: e.at, text: `${dogs.find((d) => d.id === e.dog_id)?.name ?? "Everyone"}: ${EVENT_LABELS[e.kind] ?? e.kind}${e.note ? ` — ${e.note}` : ""}` })),
              ...notes.map((n) => ({ at: n.created_at, text: `${dogs.find((d) => d.id === n.dog_id)?.name ?? ""} note: ${n.body}` }))]
              .sort((a, b) => b.at.localeCompare(a.at))
              .slice(0, 12)
              .map((row, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">{row.text}</span>
                  <span className="shrink-0 text-muted">{fmtTime(row.at, tz)}</span>
                </li>
              ))}
          </ul>
        </Card>
      ) : null}

      <div className="flex gap-2">
        <LinkButton href={`/walk/${walk.id}/incident`} variant="secondary" className="flex-1">
          Incident
        </LinkButton>
        <Link href={`/walk/${walk.id}/end`} className="btn flex flex-1 items-center justify-center rounded-xl bg-warn px-4 font-medium text-white">
          End walk
        </Link>
      </div>
    </div>
  );
}

function useElapsed(startIso: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - new Date(startIso).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

/**
 * Tracks GPS while the walk screen is open. Points queue in memory and flush
 * every 30s or 20 points — and again when the connection comes back, so a
 * dead zone on the trail doesn't lose the trail.
 */
function useGpsTracker(walkId: string, initialLine: LatLng[]) {
  const [status, setStatus] = useState("GPS off");
  const [walkedM, setWalkedM] = useState(0);
  const [line, setLine] = useState<LatLng[]>(initialLine);
  const [here, setHere] = useState<LatLng | null>(initialLine.at(-1) ?? null);
  const queue = useRef<{ at: string; lat: number; lng: number; accuracy_m?: number }[]>([]);
  const last = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("No GPS");
      return;
    }
    const flush = () => {
      if (!queue.current.length || !navigator.onLine) return;
      const batch = queue.current.splice(0, queue.current.length);
      saveGpsPoints(walkId, batch).catch(() => queue.current.unshift(...batch));
    };
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        if (accuracy > 60) return; // skip junk fixes
        setStatus(navigator.onLine ? "GPS on" : "GPS on · offline, will sync");
        if (last.current) {
          const step = distanceM(last.current, { lat, lng });
          setWalkedM((d) => d + step);
        }
        last.current = { lat, lng };
        setHere({ lat, lng });
        setLine((l) => [...l, { lat, lng }]);
        queue.current.push({ at: new Date(pos.timestamp).toISOString(), lat, lng, accuracy_m: accuracy });
        if (queue.current.length >= 20) flush();
      },
      () => setStatus("GPS blocked"),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    const t = setInterval(flush, 30000);
    window.addEventListener("online", flush);
    return () => {
      navigator.geolocation.clearWatch(id);
      clearInterval(t);
      window.removeEventListener("online", flush);
      flush();
    };
  }, [walkId]);

  return { status, distanceM: Math.round(walkedM), here, line };
}
