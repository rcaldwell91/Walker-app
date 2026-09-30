"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
import { errorOf, stash, tap } from "@/lib/offline";

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
  etaMph: number;
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

const GPS_LABEL: Record<GpsState, string> = {
  finding: "Finding you…",
  on: "GPS on",
  weak: "Weak GPS",
  off: "Location is off",
  none: "No GPS on this phone",
};
const locationOff = (g: Gps) => g.state === "off" || g.state === "none";

/** Stage 1: pickups. "On my way" with an ETA, "I'm here", each pet picked up. */
function BeforeStage({ walk, pets, gps, messages }: { walk: Walk; pets: Pet[]; gps: Gps; messages: { id: string; kind: string; client_id: string; sent_at: string }[] }) {
  const tz = useTimeZone();
  const [pending, start] = useTransition();
  // A failed tap shows on its own stop (or under Start walking), in a line that's always there.
  const [err, setErr] = useState<{ at: string; text: string } | null>(null);
  const run = (at: string, fn: () => Promise<unknown>) =>
    start(async () => {
      setErr(null);
      const e = errorOf(await tap(fn));
      if (e) setErr({ at, text: e });
    });
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
  const etaTo = (at: LatLng | null) => (gps.here && at ? etaMinutes(distanceM(gps.here, at), walk.etaMph) : undefined);
  const sent = (clientId: string, kind: string) =>
    messages.filter((m) => m.client_id === clientId && m.kind === kind).sort((a, b) => b.sent_at.localeCompare(a.sent_at))[0];
  const pickedUp = pets.filter((p) => p.picked_up_at).length;

  return (
    <div className="flex flex-col gap-4">
      <WalkSteps current={1} />
      <div>
        <h1 className="text-2xl font-semibold">Picking up</h1>
        <p className="truncate text-sm text-muted" data-gps={gps.state}>
          {walk.serviceName}
          {walk.trailName ? ` · ${walk.trailName}` : ""} · {!gps.online ? "No signal" : GPS_LABEL[gps.state]}
        </p>
      </div>

      {pins.length ? (
        <MapView pins={pins} line={gps.line} className="h-44" />
      ) : (
        <div className="flex h-44 items-center justify-center rounded-2xl border border-dashed border-border px-6 text-center text-sm text-muted">
          {locationOff(gps) ? "Location is off, so there's no map or ETA. Pickups still work." : "No addresses on the map yet."}
        </div>
      )}

      <ol className="flex flex-col gap-3">
        {stops.map((s, i) => {
          const eta = etaTo(s.at);
          const omw = sent(s.id, "on_my_way");
          const here = sent(s.id, "here");
          const e = err?.at === s.id ? err.text : null;
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
                    <span className={`block h-4 truncate text-xs ${e ? "text-warn" : "text-muted"}`} role={e ? "alert" : undefined}>
                      {e ?? (eta ? `~${eta} min away` : !s.at ? "No address on the map" : gps.state === "finding" ? "Finding you…" : "")}
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
                    onClick={() => run(s.id, () => sendStatus(walk.id, "on_my_way", s.id, eta))}
                    className="h-12 min-w-0 px-2"
                    data-send="on_my_way"
                  >
                    <span className="truncate">{omw ? `Sent ${fmtTime(omw.sent_at, tz)}` : eta ? `On my way · ${eta} min` : "On my way"}</span>
                  </Button>
                  <Button variant={here ? "secondary" : "primary"} disabled={pending} onClick={() => run(s.id, () => sendStatus(walk.id, "here", s.id))} className="h-12 min-w-0 px-2" data-send="here">
                    <span className="truncate">{here ? `Here ✓ ${fmtTime(here.sent_at, tz)}` : "I'm here"}</span>
                  </Button>
                </div>
                <ul className="flex flex-col gap-2">
                  {s.pets.map((p) => (
                    <li key={p.id} className="flex items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{p.name}</span>
                        {p.working_on ? <span className="block text-xs text-muted">Working on: {p.working_on}</span> : null}
                        {p.quirks ? <span className="block text-xs text-warn">{p.quirks}</span> : null}
                      </span>
                      <button
                        type="button"
                        disabled={pending || !!p.picked_up_at}
                        onClick={() => run(s.id, () => markPickup(walk.id, p.id, "picked_up_at"))}
                        aria-pressed={!!p.picked_up_at}
                        data-pickup={p.name}
                        className={`h-12 w-36 shrink-0 rounded-xl border-2 px-2 text-sm font-medium ${
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

      <Button className="h-16 text-lg" disabled={pending} onClick={() => run("start", () => startWalking(walk.id))} data-start-walking>
        <span className="truncate">Start walking{pets.length > 1 ? ` · ${pickedUp} of ${pets.length} picked up` : ""}</span>
      </Button>
      <p className={`-mt-2 min-h-5 text-center text-xs ${err?.at === "start" ? "text-warn" : "text-muted"}`} role="status">
        {err?.at === "start" ? err.text : "Anyone not marked yet counts as picked up."}
      </p>
    </div>
  );
}

type Flash = { text: string; tone: "ok" | "info" | "bad" } | null;
type QueuedNote = { id: string; text: string };

/** Quick notes wait on the phone until they're saved, so a dead zone or a closed app loses nothing. */
export function useNoteQueue(walkId: string) {
  const key = `notes-queue:${walkId}`;
  const [queued, setQueued] = useState<QueuedNote[]>([]);
  const busy = useRef(false);
  const flush = useCallback(async () => {
    if (busy.current || !navigator.onLine) return;
    busy.current = true;
    try {
      for (const n of stash.get<QueuedNote[]>(key, [])) {
        const r = await tap(() => addQuickNote(walkId, n.text, n.id));
        if (errorOf(r)) break;
        const left = stash.get<QueuedNote[]>(key, []).filter((x) => x.id !== n.id);
        stash.set(key, left);
        setQueued(left);
      }
    } finally {
      busy.current = false;
    }
  }, [key, walkId]);
  useEffect(() => {
    setQueued(stash.get<QueuedNote[]>(key, []));
    flush();
    const t = setInterval(flush, 30000);
    window.addEventListener("online", flush);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", flush);
    };
  }, [key, flush]);
  /** Keep it on the phone, then try to save it now. true = saved. */
  async function add(text: string) {
    const n = { id: crypto.randomUUID(), text };
    const next = [...stash.get<QueuedNote[]>(key, []), n];
    stash.set(key, next);
    setQueued(next);
    const r = await tap(() => addQuickNote(walkId, text, n.id));
    if (errorOf(r)) return false;
    const left = stash.get<QueuedNote[]>(key, []).filter((x) => x.id !== n.id);
    stash.set(key, left);
    setQueued(left);
    return true;
  }
  return { queued, add, flush };
}

/** Stage 2: nearly empty on purpose. The walker is holding leashes. */
function WalkingStage({ walk, gps, notes, photoCount }: { walk: Walk; gps: Gps; notes: { id: string; note: string; at: string }[]; photoCount: number }) {
  const [ending, startEnd] = useTransition();
  const [saving, setSaving] = useState(false);
  const elapsed = useElapsed(walk.walking_at!);
  const photos = usePhotoQueue({ walkId: walk.id }, walk.walkerId);
  const noteQueue = useNoteQueue(walk.id);
  const fileRef = useRef<HTMLInputElement>(null);
  const draftKey = `note-draft:${walk.id}`;
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState("");
  const [flash, setFlash] = useState<Flash>(null);
  // A half-typed note survives the app closing.
  useEffect(() => {
    const d = stash.get<string>(draftKey, "");
    if (d) {
      setNote(d);
      setNoting(true);
    }
  }, [draftKey]);
  const editNote = (v: string) => {
    setNote(v);
    stash.set(draftKey, v);
  };
  const shots = photoCount + photos.items.filter((i) => i.status !== "error").length;
  const noteCount = notes.length + noteQueue.queued.filter((q) => !notes.some((n) => n.id === q.id)).length;
  const mePin = useMemo<MapPin[]>(() => (gps.here ? [{ id: "me", lat: gps.here.lat, lng: gps.here.lng, kind: "me", label: "You" }] : []), [gps.here]);

  async function saveNote() {
    const text = note.trim();
    if (!text) return;
    setSaving(true);
    const ok = await noteQueue.add(text);
    setSaving(false);
    // Either way it's kept: saved now, or on the phone until there's signal.
    setNote("");
    stash.set(draftKey, "");
    setNoting(false);
    setFlash(ok ? { text: "Note saved", tone: "ok" } : navigator.onLine ? { text: "Note didn't send yet. It'll keep trying.", tone: "info" } : null);
  }
  // Say "saved" only once the photo has actually uploaded.
  const doneCount = photos.items.filter((i) => i.status === "done").length;
  const lastStatus = photos.items.at(-1)?.status;
  const prevDone = useRef(0);
  useEffect(() => {
    if (doneCount > prevDone.current) setFlash({ text: "Photo saved", tone: "ok" });
    else if (lastStatus === "uploading") setFlash({ text: "Sending photo…", tone: "info" });
    else if (lastStatus === "error") setFlash({ text: "A photo didn't send. It's in the wrap-up to try again.", tone: "bad" });
    prevDone.current = doneCount;
  }, [doneCount, lastStatus]);
  useEffect(() => {
    if (!flash || flash.text.endsWith("…")) return;
    const t = setTimeout(() => setFlash(null), 3000);
    return () => clearTimeout(t);
  }, [flash]);
  // One line, the strongest thing going on: what just happened, else no signal.
  const line: Flash = flash ?? (!gps.online ? { text: "No signal. Photos, notes and your route send when you're back in range.", tone: "info" } : null);

  function endWalk() {
    startEnd(async () => {
      const e = errorOf(await tap(() => endWalking(walk.id)));
      if (e) setFlash({ text: e, tone: "bad" });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <WalkSteps current={2} />
      <div className="text-center">
        <p className="text-6xl font-semibold tabular-nums" data-timer>
          {elapsed}
        </p>
        <p className="mt-1 h-5 truncate text-sm text-muted" data-gps={gps.state}>
          {[gps.distanceM ? `${(gps.distanceM / 1609).toFixed(2)} mi` : GPS_LABEL[gps.state], shots ? `${shots} photo${shots === 1 ? "" : "s"}` : "", noteCount ? `${noteCount} note${noteCount === 1 ? "" : "s"}` : ""]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {locationOff(gps) && !gps.line.length ? (
        <div className="flex h-[38dvh] items-center justify-center rounded-2xl border border-dashed border-border px-6 text-center text-sm text-muted" data-no-location>
          Location is off. The walk still counts; the route won&apos;t show.
        </div>
      ) : (
        <MapView line={gps.line} pins={mePin} follow className="h-[38dvh]" />
      )}

      {noting ? (
        <Card className="flex flex-col gap-3">
          <VoiceInput value={note} onValueChange={editNote} rows={3} autoFocus placeholder="Tap the mic and talk. Or type." aria-label="Quick note" />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setNoting(false)}>
              Close
            </Button>
            <Button disabled={saving || !note.trim()} onClick={saveNote} data-save-note>
              {saving ? "Saving…" : "Save note"}
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
            {note ? "Note (draft)" : "Note"}
          </button>
        </div>
      )}
      <p
        className={`line-clamp-2 min-h-10 text-center text-sm ${line?.tone === "ok" ? "text-accent" : line?.tone === "bad" ? "text-warn" : "text-muted"}`}
        role="status"
      >
        {line?.text}
      </p>

      <button
        type="button"
        onClick={endWalk}
        disabled={ending}
        className="btn flex h-16 w-full items-center justify-center rounded-xl bg-fg px-4 text-lg font-medium text-bg disabled:opacity-60"
        data-end-walk
      >
        {ending ? "Ending…" : "End walk"}
      </button>
      <Link href={`/walk/${walk.id}/incident`} className="-mt-2 min-h-11 py-2 text-center text-sm text-muted underline">
        Something happened? Incident report
      </Link>
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

type GpsState = "finding" | "on" | "weak" | "off" | "none";
type Point = { at: string; lat: number; lng: number; accuracy_m?: number };

/**
 * Tracks GPS while the walk screen is open. Points wait on the phone
 * (localStorage) and are sent every 30s or 20 points, and again when signal
 * comes back, so a dead zone or the app closing doesn't lose the route.
 */
function useGpsTracker(walkId: string, initialLine: LatLng[]) {
  const [state, setState] = useState<GpsState>("finding");
  const [online, setOnline] = useState(true);
  const [walkedM, setWalkedM] = useState(0);
  const [line, setLine] = useState<LatLng[]>(initialLine);
  const [here, setHere] = useState<LatLng | null>(initialLine.at(-1) ?? null);
  const key = `gps-queue:${walkId}`;
  const last = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    let sending = false;
    const flush = async () => {
      const batch = stash.get<Point[]>(key, []);
      if (sending || !batch.length || !navigator.onLine) return;
      sending = true;
      try {
        await saveGpsPoints(walkId, batch);
        // Keep anything that arrived while sending.
        stash.set(key, stash.get<Point[]>(key, []).slice(batch.length));
      } catch {
        /* stays on the phone; next flush tries again */
      } finally {
        sending = false;
      }
    };
    flush(); // points left from last time the app was open
    const t = setInterval(flush, 30000);
    window.addEventListener("online", flush);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("none");
      return () => {
        clearInterval(t);
        window.removeEventListener("online", flush);
      };
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        if (accuracy > 60) {
          setState((s) => (s === "on" ? s : "weak")); // skip junk fixes
          return;
        }
        setState("on");
        if (last.current) {
          const step = distanceM(last.current, { lat, lng });
          setWalkedM((d) => d + step);
        }
        last.current = { lat, lng };
        setHere({ lat, lng });
        setLine((l) => [...l, { lat, lng }]);
        const q = [...stash.get<Point[]>(key, []), { at: new Date(pos.timestamp).toISOString(), lat, lng, accuracy_m: accuracy }];
        stash.set(key, q);
        if (q.length >= 20) flush();
      },
      (err) => setState(err.code === err.PERMISSION_DENIED ? "off" : "weak"),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => {
      navigator.geolocation.clearWatch(id);
      clearInterval(t);
      window.removeEventListener("online", flush);
      flush();
    };
  }, [walkId, key]);

  return { state, online, distanceM: Math.round(walkedM), here, line };
}
