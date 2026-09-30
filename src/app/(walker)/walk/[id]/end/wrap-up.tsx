"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { finishWalk, markPickup, sendStatus, type WrapUpPayload } from "../../actions";
import { interpretWrapUp, type VoiceFill } from "../../voice-actions";
import { Badge, Button, Card, ErrorText, Input, SectionTitle } from "@/components/ui";
import { VoiceInput, useSpeechToText } from "@/components/voice-input";
import { WalkSteps } from "@/components/walk-steps";
import { BackBar } from "@/components/back-bar";
import { EVENT_EMOJI, EVENT_LABELS } from "@/lib/events";
import { PET_SCORES } from "@/lib/pet-scores";
import { usePhotoQueue } from "@/lib/photo-queue";

type Pet = { id: string; name: string; workingOn: string; own: boolean; clientId: string; clientName: string };
type PetState = { counts: Record<string, number>; scores: Record<string, number>; workingOn: string };
type Draft = { pets: Record<string, PetState>; summary: string; tags: Record<string, string[]>; filled: string[]; touched: string[] };

/**
 * Stage 3. One scrollable page: drop-offs, per-pet log taps, ratings and
 * "working on", the photo gallery with pet tags, the summary, Finish. It's all
 * a draft on this phone (survives a reload or a dead zone) until Finish.
 */
export function WrapUp({
  walkId,
  walkerId,
  serviceName,
  buttons,
  pets,
  clients,
  photos: initialPhotos,
  notes,
  voiceReady,
}: {
  walkId: string;
  walkerId: string;
  serviceName: string;
  buttons: string[];
  pets: Pet[];
  clients: { id: string; name: string; droppedOff: boolean }[];
  photos: { id: string; url: string; tags: string[] }[];
  notes: { id: string; note: string; at: string }[];
  voiceReady: boolean;
}) {
  const storageKey = `wrapup:${walkId}`;
  const single = pets.length === 1 ? pets[0].id : null;
  const fresh = (): Draft => ({
    pets: Object.fromEntries(pets.map((p) => [p.id, { counts: {}, scores: {}, workingOn: p.workingOn }])),
    summary: "",
    tags: Object.fromEntries(initialPhotos.map((ph) => [ph.id, ph.tags.length ? ph.tags : single ? [single] : []])),
    filled: [],
    touched: [],
  });
  const [draft, setDraft] = useState<Draft>(fresh);
  const [loaded, setLoaded] = useState(false);
  const [undo, setUndo] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finishing, startFinish] = useTransition();
  const [dropping, startDrop] = useTransition();
  const [dropped, setDropped] = useState(() => new Set(clients.filter((c) => c.droppedOff).map((c) => c.id)));
  const queue = usePhotoQueue(walkId, walkerId);

  // Restore the draft saved on this phone, then keep saving it.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const d = JSON.parse(saved) as Draft;
        setDraft((cur) => ({
          ...cur,
          ...d,
          pets: Object.fromEntries(Object.entries(cur.pets).map(([id, p]) => [id, d.pets?.[id] ?? p])),
          tags: { ...cur.tags, ...d.tags },
        }));
      }
    } catch {
      /* private mode, or an old draft: start fresh */
    }
    setLoaded(true);
  }, [storageKey]);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      /* storage full or blocked */
    }
  }, [draft, loaded, storageKey]);

  // New photos: tagged with the only pet on the walk, otherwise untagged until the walker picks.
  useEffect(() => {
    setDraft((d) => {
      const missing = queue.items.filter((i) => !(i.id in d.tags));
      if (!missing.length) return d;
      return { ...d, tags: { ...d.tags, ...Object.fromEntries(missing.map((i) => [i.id, single ? [single] : []])) } };
    });
  }, [queue.items, single]);

  const filled = useMemo(() => new Set(draft.filled), [draft.filled]);
  /** A manual change: the field is the walker's now, and voice won't overwrite it. */
  const edit = (key: string, change: (d: Draft) => Draft) =>
    setDraft((d) => {
      const next = change(d);
      return { ...next, filled: next.filled.filter((k) => k !== key), touched: next.touched.includes(key) ? next.touched : [...next.touched, key] };
    });
  const setPet = (id: string, change: (p: PetState) => PetState) => (d: Draft) => ({ ...d, pets: { ...d.pets, [id]: change(d.pets[id]) } });

  function applyVoice(fill: VoiceFill) {
    setUndo(draft);
    setDraft((d) => {
      const touched = new Set(d.touched);
      const marks = new Set(d.filled);
      const petsNext = { ...d.pets };
      for (const f of fill.pets) {
        const cur = petsNext[f.id];
        if (!cur) continue;
        const p = { counts: { ...cur.counts }, scores: { ...cur.scores }, workingOn: cur.workingOn };
        for (const [kind, n] of Object.entries(f.counts)) {
          const key = `count:${f.id}:${kind}`;
          if (touched.has(key) || !buttons.includes(kind)) continue;
          p.counts[kind] = n;
          marks.add(key);
        }
        for (const [cat, n] of Object.entries(f.scores)) {
          const key = `score:${f.id}:${cat}`;
          if (touched.has(key)) continue;
          p.scores[cat] = n;
          marks.add(key);
        }
        const woKey = `wo:${f.id}`;
        if (f.workingOn && !touched.has(woKey) && pets.find((x) => x.id === f.id)?.own) {
          p.workingOn = f.workingOn;
          marks.add(woKey);
        }
        petsNext[f.id] = p;
      }
      let summary = d.summary;
      if (fill.summary) {
        // Never lose what the walker typed: add the draft after it.
        summary = d.summary.trim() ? `${d.summary.trim()}\n\n${fill.summary}` : fill.summary;
        marks.add("summary");
      }
      return { ...d, pets: petsNext, summary, filled: [...marks] };
    });
  }

  const allPhotos = [...initialPhotos.map((p) => ({ id: p.id, url: p.url, status: "done" as const })), ...queue.items];
  const sending = queue.pending;

  function finish() {
    setError(null);
    const payload: WrapUpPayload = {
      pets: pets.map((p) => ({
        id: p.id,
        counts: draft.pets[p.id]?.counts ?? {},
        scores: draft.pets[p.id]?.scores ?? {},
        workingOn: p.own ? draft.pets[p.id]?.workingOn ?? "" : undefined,
      })),
      photos: allPhotos.filter((p) => p.status === "done").map((p) => ({ id: p.id, petIds: draft.tags[p.id] ?? [] })),
      summary: draft.summary,
    };
    startFinish(async () => {
      try {
        const r = await finishWalk(walkId, payload);
        if (r?.error) setError(r.error);
      } catch (e) {
        // A redirect means it worked; anything else is most likely no signal.
        // A redirect means it worked (the done page clears the draft).
        if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) throw e;
        setError(navigator.onLine ? "Couldn't save. Try Finish again." : "No signal. Your wrap-up is saved on this phone; tap Finish again when you have signal.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4" data-wrapup>
      <WalkSteps current={3} />
      <div>
        <h1 className="text-2xl font-semibold">Wrap-up</h1>
        <p className="text-sm text-muted">{serviceName} · Nothing is sent to owners until you tap Finish.</p>
      </div>

      <TalkItThrough walkId={walkId} ready={voiceReady} onFill={applyVoice} />
      {undo ? (
        <Card className="flex items-center justify-between gap-2 border-voice" data-voice-filled={draft.filled.length}>
          <p className="text-sm">
            <span className="font-medium text-voice">Filled in {draft.filled.length} thing{draft.filled.length === 1 ? "" : "s"} from what you said.</span>{" "}
            <span className="text-muted">Outlined below. Check them, then Finish.</span>
          </p>
          <Button
            variant="secondary"
            className="shrink-0 px-3 text-sm"
            onClick={() => {
              setDraft(undo);
              setUndo(null);
            }}
          >
            Undo
          </Button>
        </Card>
      ) : null}

      {clients.length ? (
        <>
          <SectionTitle>Drop-offs</SectionTitle>
          <Card className="flex flex-col gap-2">
            {clients.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium">{c.name}</span>
                <Button
                  variant={dropped.has(c.id) ? "secondary" : "primary"}
                  disabled={dropping || dropped.has(c.id)}
                  data-dropoff={c.name}
                  onClick={() =>
                    startDrop(async () => {
                      await sendStatus(walkId, "dropped_off", c.id);
                      for (const p of pets.filter((x) => x.clientId === c.id)) await markPickup(walkId, p.id, "dropped_off_at");
                      setDropped((s) => new Set(s).add(c.id));
                    })
                  }
                >
                  {dropped.has(c.id) ? "Dropped off ✓" : "Dropped off"}
                </Button>
              </div>
            ))}
            <p className="text-xs text-muted">Sends the owner &ldquo;Dropped off safe and sound.&rdquo;</p>
          </Card>
        </>
      ) : null}

      {pets.map((p) => {
        const st = draft.pets[p.id];
        if (!st) return null;
        return (
          <section key={p.id} aria-label={p.name} data-pet-wrapup={p.name}>
            <SectionTitle>{p.name}</SectionTitle>
            <Card className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-2">
                {buttons.map((b) => {
                  const key = `count:${p.id}:${b}`;
                  const n = st.counts[b] ?? 0;
                  return (
                    <div key={b} className="relative">
                      <button
                        type="button"
                        onClick={() => edit(key, setPet(p.id, (s) => ({ ...s, counts: { ...s.counts, [b]: Math.min(20, (s.counts[b] ?? 0) + 1) } })))}
                        className={`flex h-20 w-full flex-col items-center justify-center rounded-2xl border-2 text-sm font-medium active:scale-95 ${
                          n ? "border-accent bg-accent/10" : "border-border bg-bg"
                        } ${filled.has(key) ? "ring-2 ring-voice ring-offset-2 ring-offset-card" : ""}`}
                        data-log={b}
                        data-count={n}
                      >
                        <span className="text-2xl" aria-hidden="true">
                          {EVENT_EMOJI[b] ?? "•"}
                        </span>
                        {EVENT_LABELS[b] ?? b}
                        {n > 1 ? ` ×${n}` : ""}
                      </button>
                      {n ? (
                        <button
                          type="button"
                          aria-label={`One less ${EVENT_LABELS[b] ?? b}`}
                          onClick={() => edit(key, setPet(p.id, (s) => ({ ...s, counts: { ...s.counts, [b]: Math.max(0, (s.counts[b] ?? 0) - 1) } })))}
                          className="absolute -right-1 -top-1 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-lg shadow-card"
                        >
                          −
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col gap-3">
                {PET_SCORES.map((sc) => {
                  const key = `score:${p.id}:${sc.key}`;
                  const v = st.scores[sc.key];
                  return (
                    <div key={sc.key} data-score={sc.key} className={filled.has(key) ? "rounded-xl ring-2 ring-voice ring-offset-2 ring-offset-card" : ""}>
                      <p className="mb-1 flex justify-between text-sm">
                        <span className="font-medium">{sc.label}</span>
                        <span className="text-xs text-muted">
                          1 {sc.low} · 5 {sc.high}
                        </span>
                      </p>
                      <div className="grid grid-cols-5 gap-1" role="radiogroup" aria-label={`${p.name}: ${sc.label}`}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            role="radio"
                            aria-checked={v === n}
                            onClick={() =>
                              edit(key, setPet(p.id, (s) => {
                                const scores = { ...s.scores };
                                if (scores[sc.key] === n) delete scores[sc.key];
                                else scores[sc.key] = n;
                                return { ...s, scores };
                              }))
                            }
                            className={`h-11 rounded-xl border text-sm font-medium ${v === n ? "border-accent bg-accent text-accent-fg" : "border-border bg-bg"}`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-muted">All optional. Tap again to clear.</p>
              </div>

              {p.own ? (
                <label className={`block ${filled.has(`wo:${p.id}`) ? "rounded-xl ring-2 ring-voice ring-offset-2 ring-offset-card" : ""}`}>
                  <span className="mb-1 block text-sm font-medium">Working on</span>
                  <Input
                    value={st.workingOn}
                    onChange={(e) => {
                      const v = e.target.value;
                      edit(`wo:${p.id}`, setPet(p.id, (s) => ({ ...s, workingOn: v })));
                    }}
                    placeholder="Optional, e.g. loose leash"
                    data-working-on={p.name}
                  />
                </label>
              ) : (
                <p className="text-sm text-muted" data-covered-dog={p.name}>
                  You&apos;re covering. Their walker keeps what {p.name} is working on; put anything they should know in the summary.
                </p>
              )}
            </Card>
          </section>
        );
      })}

      <SectionTitle>Photos</SectionTitle>
      <Card className="flex flex-col gap-3">
        {allPhotos.length ? (
          <ul className="grid grid-cols-2 gap-3" aria-label="Walk photos">
            {allPhotos.map((ph) => {
              const tags = draft.tags[ph.id] ?? [];
              return (
                <li key={ph.id} className="flex flex-col gap-2" data-photo={ph.id}>
                  <div className="relative aspect-square overflow-hidden rounded-xl bg-border">
                    {ph.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ph.url} alt="" className="h-full w-full object-cover" />
                    ) : null}
                    {ph.status !== "done" ? (
                      <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-1 text-center text-xs text-white">
                        {ph.status === "uploading" ? "Sending…" : ph.status === "queued" ? "Will send when online" : "Didn't send"}
                      </span>
                    ) : null}
                  </div>
                  {pets.length > 1 ? (
                    <div className="flex flex-wrap gap-1">
                      {pets.map((p) => {
                        const on = tags.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                tags: { ...d.tags, [ph.id]: on ? (d.tags[ph.id] ?? []).filter((x) => x !== p.id) : [...(d.tags[ph.id] ?? []), p.id] },
                              }))
                            }
                            className={`min-h-11 rounded-full border px-3 text-sm ${on ? "border-accent bg-accent text-accent-fg" : "border-border bg-bg"}`}
                            data-tag={p.name}
                          >
                            {p.name}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">No photos yet.</p>
        )}
        {pets.length > 1 ? <p className="text-xs text-muted">Tap the pets in each photo. A photo with none tagged goes to everyone on this walk.</p> : null}
        <PhotoButton onFiles={queue.add} />
      </Card>

      {notes.length ? (
        <>
          <SectionTitle>Notes from the walk</SectionTitle>
          <Card className="flex flex-col gap-2">
            {notes.map((n) => (
              <div key={n.id} className="flex items-start justify-between gap-2 text-sm">
                <p className="min-w-0 whitespace-pre-wrap">{n.note}</p>
                <button
                  type="button"
                  className="min-h-11 shrink-0 px-2 text-accent underline"
                  onClick={() => edit("summary", (d) => ({ ...d, summary: d.summary.trim() ? `${d.summary.trim()}\n${n.note}` : n.note }))}
                >
                  Add to summary
                </button>
              </div>
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle>Walk summary for the owners</SectionTitle>
      <div className={filled.has("summary") ? "rounded-xl ring-2 ring-voice ring-offset-2 ring-offset-bg" : ""}>
        <VoiceInput
          value={draft.summary}
          onValueChange={(v) => edit("summary", (d) => ({ ...d, summary: v }))}
          rows={4}
          placeholder="Optional. Tap the mic and talk, or type."
          aria-label="Walk summary for the owners"
        />
      </div>

      <Link href={`/walk/${walkId}/incident`} className="min-h-11 py-2 text-center text-sm text-muted underline">
        Something happened? File an incident report
      </Link>

      <ErrorText>{error}</ErrorText>
      <Button className="h-16 text-lg" disabled={finishing || sending > 0} onClick={finish} data-finish>
        {finishing ? "Sending…" : sending ? `Waiting for ${sending} photo${sending === 1 ? "" : "s"}…` : "Finish walk"}
      </Button>
      <BackBar href="/home" label="Today" />
    </div>
  );
}

function PhotoButton({ onFiles }: { onFiles: (f: FileList | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
        data-add-photos-input
      />
      <Button type="button" variant="secondary" onClick={() => ref.current?.click()} data-add-photos>
        Add photos
      </Button>
    </>
  );
}

/**
 * The big button at the top. Talk normally; the browser turns it into text;
 * the server asks Claude to fill the wrap-up in. Without an API key it says
 * "Needs setup" and everything else works as usual.
 */
function TalkItThrough({ walkId, ready, onFill }: { walkId: string; ready: boolean; onFill: (f: VoiceFill) => void }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(!ready);
  const [pending, start] = useTransition();
  const textRef = useRef(text);
  textRef.current = text;
  const speech = useSpeechToText((t) => setText((v) => (v ? `${v.trim()} ${t}` : t)));

  if (needsSetup) {
    return (
      <Card className="flex flex-col gap-2" data-voice="needs-setup">
        <button type="button" disabled className="btn flex h-16 w-full items-center justify-center gap-2 rounded-xl border border-border bg-bg text-lg font-medium opacity-60">
          🎙️ Talk it through
        </button>
        <p className="flex items-center gap-2 text-sm text-muted">
          <Badge tone="muted">Needs setup</Badge> Voice fill isn&apos;t switched on yet. Use the buttons below.
        </p>
      </Card>
    );
  }

  function fill() {
    const said = textRef.current.trim();
    if (!said) return setMsg("Say how the walk went first.");
    speech.stop();
    setMsg(null);
    start(async () => {
      try {
        const r = await interpretWrapUp(walkId, said);
        if ("fill" in r) {
          onFill(r.fill); // the transcript stays, so nothing moves under the thumb
        } else {
          setMsg(r.error);
          if (r.setup) setNeedsSetup(true);
        }
      } catch {
        setMsg(navigator.onLine ? "Voice fill didn't work this time. The buttons still work." : "No signal for voice fill. The buttons still work.");
      }
    });
  }

  return (
    <Card className="flex flex-col gap-3" data-voice="ready">
      <button
        type="button"
        onClick={speech.listening ? speech.stop : speech.start}
        disabled={!speech.supported || pending}
        className={`btn flex h-16 w-full items-center justify-center gap-2 rounded-xl text-lg font-medium ${
          speech.listening ? "animate-pulse bg-warn text-warn-fg" : "bg-accent text-accent-fg"
        }`}
      >
        🎙️ {speech.listening ? "Listening… tap to stop" : "Talk it through"}
      </button>
      <p className="text-xs text-muted">
        {speech.blocked
          ? "Can't use the microphone. Type the rundown below instead, or allow it in settings."
          : speech.supported
          ? "e.g. “Rex pooped twice, peed, had water, we worked on loose leash, low energy today but happy.”"
          : "This browser can't listen. Type the rundown instead."}
      </p>
      {text || speech.interim || !speech.supported || speech.blocked ? (
        <>
          <textarea
            value={text + (speech.interim ? ` ${speech.interim}` : "")}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-base"
            aria-label="What you said"
          />
          <Button onClick={fill} disabled={pending || !text.trim()}>
            {pending ? "Filling in…" : "Fill in the wrap-up"}
          </Button>
        </>
      ) : null}
      {msg ? (
        <p className="text-sm text-warn" role="status">
          {msg}
        </p>
      ) : null}
    </Card>
  );
}
