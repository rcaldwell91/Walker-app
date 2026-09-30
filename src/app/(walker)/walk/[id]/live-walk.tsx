"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addQuickNote, endWalking, markPickup, saveGpsPoints, sendStatus, startWalking } from "../actions";
import { Button, Card } from "@/components/ui";
import { VoiceInput } from "@/components/voice-input";
import { WalkSteps } from "@/components/walk-steps";
import { BackBar } from "@/components/back-bar";
import { fmtTime } from "@/lib/format";
import { useTimeZone } from "@/components/timezone-context";
import { MapView, type MapPin } from "@/components/map-view";
import { distanceM, etaMinutes, type LatLng } from "@/lib/geo/distance";
import { usePhotoQueue } from "@/lib/photo-queue";

type Pet = {
  id: string;
  name: string;
  working_on: string;
  quirks: string | null;
  clientId: string;
  clientName: string;
  clientColor: string | null;
  homeNotes: string | null;
  clientLat: number | null;
  clientLng: number | null;
  picked_up_at: string | null;
};
type Walk = {
  id: string;
  walkerId: string;
  started_at: string;
  walking_at: string | null;
  serviceName: string;
  trailName: string | null;
  pickupOrder: string[];
};

/**
 * Stages 1 and 2 of a walk. One component for both, so GPS tracking carries
 * straight on when the walker taps "Start walking".
 */
export function LiveWalk({
  walk,
  pets,
  notes,
  photoCount,
  messages,
  initialLine,
}: {
  walk: Walk;
  pets: Pet[];
  notes: { id: string; note: string; at: string }[];
  photoCount: number;
  messages: { id: string; kind: string; client_id: string; sent_at: string }[];
  initialLine: LatLng[];
}) {
  const gps = useGpsTracker(walk.id, initialLine);
  return (
    <>
      {walk.walking_at ? (
        <WalkingStage walk={walk} gps={gps} notes={notes} photoCount={photoCount} />
      ) : (
        <BeforeStage walk={walk} pets={pets} gps={gps} messages={messages} />
      )}
      <BackBar href="/home" label="Today" />
    </>
  );
}

type Gps = ReturnType<typeof useGpsTracker>;

/** Stage 1: pickups. "On my way" with an ETA, "I'm here", each pet picked up. */
function BeforeStage({ walk, pets, gps, messages }: { walk: Walk; pets: Pet[]; gps: Gps; messages: { id: string; kind: string; client_id: string; sent_at: string }[] }) {
  const tz = useTimeZone();
  const [pending, start] = useTransition();
  // One stop per client, in pickup order.
  const stops = useMemo(() => {
    const rank = (id: string) => {
      const i = walk.pickupOrder.indexOf(id);
      return i === -1 ? Infinity : i;
    };
    const byClient = new Map<string, { id: string; name: string; color: string | null; at: LatLng | null; homeNotes: string | null; pets: Pet[] }>();
    for (const p of pets) {
      const s = byClient.get(p.clientId) ?? {
        id: p.clientId,
        name: p.clientName,
        color: p.clientColor,
        at: p.clientLat != null && p.clientLng != null ? { lat: p.clientLat, lng: p.clientLng } : null,
        homeNotes: p.homeNotes,
        pets: [],
      };
      s.pets.push(p);
      byClient.set(p.clientId, s);
    }
    return [...byClient.values()].sort((a, b) => rank(a.id) - rank(b.id));
  }, [pets, walk.pickupOrder]);
  const pins = useMemo<MapPin[]>(() => {
    const out: MapPin[] = stops.flatMap((c, i) => (c.at ? [{ id: `stop:${c.id}`, lat: c.at.lat, lng: c.at.lng, kind: "stop" as const, color: c.color, label: String(i + 1) }] : []));
    if (gps.here) out.push({ id: "me", lat: gps.here.lat, lng: gps.here.lng, kind: "me", label: "You" });
    return out;
  }, [stops, gps.here]);
  // Straight-line ETA from where the walker is now. Real road routing comes later.
  const etaTo = (at: LatLng | null) => (gps.here && at ? etaMinutes(distanceM(gps.here, at)) : undefined);
  const sent = (clientId: string, kind: string) =>
    messages.filter((m) => m.client_id === clientId && m.kind === kind).sort((a, b) => b.sent_at.localeCompare(a.sent_at))[0];
  const pickedUp = pets.filter((p) => p.picked_up_at).length;

  return (
    <div className="flex flex-col gap-4">
      <WalkSteps current={1} />
      <div>
        <h1 className="text-2xl font-semibold">Picking up</h1>
        <p className="text-sm text-muted">
          {walk.serviceName}
          {walk.trailName ? ` · ${walk.trailName}` : ""} · {gps.status}
        </p>
      </div>

      <MapView pins={pins} line={gps.line} className="h-44" />

      <ol className="flex flex-col gap-3">
        {stops.map((s, i) => {
          const eta = etaTo(s.at);
          const omw = sent(s.id, "on_my_way");
          const here = sent(s.id, "here");
          return (
            <li key={s.id} data-stop={s.name}>
              <Card className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                    style={{ background: s.color ?? "var(--muted)" }}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{s.name}</span>
                    <span className="block text-xs text-muted">
                      {eta ? `~${eta} min away` : !s.at ? "No address on the map" : gps.status === "GPS blocked" || gps.status === "No GPS" ? "Location is off, so no ETA" : "Finding you…"}
                    </span>
                  </span>
                </div>
                {s.homeNotes ? (
                  <p className="rounded-xl bg-bg px-3 py-2 text-sm" data-home-notes>
                    <span className="font-medium">Home access:</span> {s.homeNotes}
                  </p>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={omw ? "secondary" : "primary"}
                    disabled={pending}
                    onClick={() => start(() => sendStatus(walk.id, "on_my_way", s.id, eta))}
                    data-send="on_my_way"
                  >
                    {omw ? `Sent ${fmtTime(omw.sent_at, tz)}` : eta ? `On my way · ${eta} min` : "On my way"}
                  </Button>
                  <Button variant={here ? "secondary" : "primary"} disabled={pending} onClick={() => start(() => sendStatus(walk.id, "here", s.id))} data-send="here">
                    {here ? `Here ✓ ${fmtTime(here.sent_at, tz)}` : "I'm here"}
                  </Button>
                </div>
                <ul className="flex flex-col gap-2">
                  {s.pets.map((p) => (
                    <li key={p.id} className="flex items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{p.name}</span>
                        {p.working_on ? <span className="block text-xs text-muted">Working on: {p.working_on}</span> : null}
                        {p.quirks ? <span className="block text-xs text-warn">{p.quirks}</span> : null}
                      </span>
                      <button
                        type="button"
                        disabled={pending || !!p.picked_up_at}
                        onClick={() => start(() => markPickup(walk.id, p.id, "picked_up_at"))}
                        aria-pressed={!!p.picked_up_at}
                        data-pickup={p.name}
                        className={`min-h-12 shrink-0 rounded-xl border-2 px-4 text-sm font-medium ${
                          p.picked_up_at ? "border-accent bg-accent/10 text-accent" : "border-border bg-card"
                        }`}
                      >
                        {p.picked_up_at ? "✓ Picked up" : "Picked up"}
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            </li>
          );
        })}
      </ol>

      <Button className="h-16 text-lg" disabled={pending} onClick={() => start(() => startWalking(walk.id))} data-start-walking>
        Start walking{pets.length > 1 ? ` · ${pickedUp} of ${pets.length} picked up` : ""}
      </Button>
      <p className="-mt-2 text-center text-xs text-muted">Anyone not marked yet counts as picked up.</p>
    </div>
  );
}

/** Stage 2: nearly empty on purpose. The walker is holding leashes. */
function WalkingStage({ walk, gps, notes, photoCount }: { walk: Walk; gps: Gps; notes: { id: string; note: string; at: string }[]; photoCount: number }) {
  const [pending, start] = useTransition();
  const elapsed = useElapsed(walk.walking_at!);
  const photos = usePhotoQueue({ walkId: walk.id }, walk.walkerId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const shots = photoCount + photos.items.length;
  const mePin = useMemo<MapPin[]>(() => (gps.here ? [{ id: "me", lat: gps.here.lat, lng: gps.here.lng, kind: "me", label: "You" }] : []), [gps.here]);

  function saveNote() {
    const text = note;
    start(async () => {
      const r = await addQuickNote(walk.id, text);
      if (r?.error) setFlash(r.error);
      else {
        setNote("");
        setNoting(false);
        setFlash("Note saved");
      }
    });
  }
  // Say "saved" only once the photo has actually uploaded.
  const doneCount = photos.items.filter((i) => i.status === "done").length;
  const lastStatus = photos.items.at(-1)?.status;
  const prevDone = useRef(0);
  useEffect(() => {
    if (doneCount > prevDone.current) setFlash("Photo saved");
    else if (lastStatus === "uploading") setFlash("Sending photo…");
    else if (lastStatus === "queued") setFlash("No signal. The photo will send when you have signal.");
    else if (lastStatus === "error") setFlash("That photo didn't send. Try again.");
    prevDone.current = doneCount;
  }, [doneCount, lastStatus]);
  useEffect(() => {
    if (!flash || flash.endsWith("…")) return;
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  return (
    <div className="flex flex-col gap-4">
      <WalkSteps current={2} />
      <div className="text-center">
        <p className="text-6xl font-semibold tabular-nums" data-timer>
          {elapsed}
        </p>
        <p className="mt-1 text-sm text-muted">
          {gps.distanceM ? `${(gps.distanceM / 1609).toFixed(2)} mi · ` : ""}
          {gps.status}
          {shots ? ` · ${shots} photo${shots === 1 ? "" : "s"}` : ""}
          {notes.length ? ` · ${notes.length} note${notes.length === 1 ? "" : "s"}` : ""}
          {photos.pending ? ` · ${photos.pending} sending` : ""}
        </p>
      </div>

      <MapView line={gps.line} pins={mePin} follow className="h-[38dvh]" />

      {noting ? (
        <Card className="flex flex-col gap-3">
          <VoiceInput value={note} onValueChange={setNote} rows={3} autoFocus placeholder="Tap the mic and talk. Or type." aria-label="Quick note" />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setNoting(false)}>
              Cancel
            </Button>
            <Button disabled={pending || !note.trim()} onClick={saveNote} data-save-note>
              Save note
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => {
            photos.add(e.target.files);
            e.target.value = "";
          }} data-quick-photo-input />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-28 flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-card text-lg font-medium shadow-card active:scale-[0.98]"
            data-quick-photo
          >
            <span className="text-3xl" aria-hidden="true">📷</span>
            Photo
          </button>
          <button
            type="button"
            onClick={() => setNoting(true)}
            className="flex h-28 flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-card text-lg font-medium shadow-card active:scale-[0.98]"
            data-quick-note
          >
            <span className="text-3xl" aria-hidden="true">📝</span>
            Note
          </button>
        </div>
      )}
      <p className="min-h-10 text-center text-sm text-accent" role="status">
        {flash}
      </p>

      <form action={endWalking.bind(null, walk.id)}>
        <button className="btn flex h-16 w-full items-center justify-center rounded-xl bg-warn px-4 text-lg font-medium text-warn-fg" data-end-walk>
          End walk
        </button>
      </form>
    </div>
  );
}

function useElapsed(startIso: string) {
  // Starts in the browser only: a server-rendered time would never match (hydration error).
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return "–:––";
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
