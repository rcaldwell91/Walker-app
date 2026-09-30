"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { finishWalk, markPickup, sendStatus, type WrapUpPayload } from "../../actions";
import { interpretWrapUp, type VoiceFill } from "../../voice-actions";
import { Button, Card, ErrorText, Input, SectionTitle } from "@/components/ui";
import { VoiceInput } from "@/components/voice-input";
import { LogGrid, PhotoGallery, ScoreGrid, TalkItThrough, VoiceFilledBar } from "@/components/report-parts";
import { WalkSteps } from "@/components/walk-steps";
import { BackBar } from "@/components/back-bar";
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
  const queue = usePhotoQueue({ walkId }, walkerId);

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
          // Only fill what's still blank (or was filled by voice): the walker's own taps stay.
          if (touched.has(key) || !buttons.includes(kind) || (!marks.has(key) && (cur.counts[kind] ?? 0) !== 0)) continue;
          p.counts[kind] = n;
          marks.add(key);
        }
        for (const [cat, n] of Object.entries(f.scores)) {
          const key = `score:${f.id}:${cat}`;
          if (touched.has(key) || (!marks.has(key) && cur.scores[cat] !== undefined)) continue;
          p.scores[cat] = n;
          marks.add(key);
        }
        const woKey = `wo:${f.id}`;
        const before = pets.find((x) => x.id === f.id);
        const changed = !marks.has(woKey) && cur.workingOn !== (before?.workingOn ?? "");
        if (f.workingOn && !touched.has(woKey) && !changed && before?.own) {
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

      <TalkItThrough
        ready={voiceReady}
        interpret={(t) => interpretWrapUp(walkId, t)}
        example="e.g. “Rex pooped twice, peed, had water, we worked on loose leash, low energy today but happy.”"
        emptyPrompt="Say how the walk went first."
        fillLabel="Fill in the wrap-up"
        onFill={applyVoice}
      />
      {undo ? (
        <VoiceFilledBar
          count={draft.filled.length}
          onUndo={() => {
            setDraft(undo);
            setUndo(null);
          }}
        />
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
              <LogGrid
                pet={p.name}
                buttons={buttons}
                counts={st.counts}
                filled={(b) => filled.has(`count:${p.id}:${b}`)}
                onChange={(b, n) => edit(`count:${p.id}:${b}`, setPet(p.id, (s) => ({ ...s, counts: { ...s.counts, [b]: n } })))}
              />
              <ScoreGrid
                pet={p.name}
                scores={st.scores}
                filled={(c) => filled.has(`score:${p.id}:${c}`)}
                onChange={(c, n) =>
                  edit(`score:${p.id}:${c}`, setPet(p.id, (s) => {
                    const scores = { ...s.scores };
                    if (n === undefined) delete scores[c];
                    else scores[c] = n;
                    return { ...s, scores };
                  }))
                }
              />

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
      <PhotoGallery
        photos={allPhotos}
        pets={pets}
        tags={draft.tags}
        onToggleTag={(photoId, petId) =>
          setDraft((d) => {
            const cur = d.tags[photoId] ?? [];
            return { ...d, tags: { ...d.tags, [photoId]: cur.includes(petId) ? cur.filter((x) => x !== petId) : [...cur, petId] } };
          })
        }
        onFiles={queue.add}
        groupHint="Tap the pets in each photo. A photo with none tagged goes to everyone on this walk."
      />

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
