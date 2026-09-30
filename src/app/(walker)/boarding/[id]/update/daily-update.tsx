"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { interpretStayUpdate, postStayUpdate, type StayUpdatePayload } from "../../actions";
import { Button, Card, ErrorText, SectionTitle } from "@/components/ui";
import { VoiceInput } from "@/components/voice-input";
import { BackBar } from "@/components/back-bar";
import { LogGrid, PhotoGallery, ScoreGrid, TalkItThrough, VoiceFilledBar } from "@/components/report-parts";
import { usePhotoQueue } from "@/lib/photo-queue";
import type { VoiceFill } from "@/lib/voice-fill";

type PetState = { counts: Record<string, number>; scores: Record<string, number> };
type Draft = { pets: Record<string, PetState>; note: string; tags: Record<string, string[]>; filled: string[]; touched: string[] };

/**
 * A day of a boarding stay: taps (fed, meds, potty, walk, playtime), ratings,
 * photos with pet tags, a short note. A draft on this phone until "Post".
 */
export function DailyUpdate({
  stayId,
  updateId,
  walkerId,
  dayLabel,
  clientName,
  posted,
  buttons,
  pets,
  saved,
  note,
  photos: initialPhotos,
  voiceReady,
}: {
  stayId: string;
  updateId: string;
  walkerId: string;
  dayLabel: string;
  clientName: string;
  posted: boolean;
  buttons: string[];
  pets: { id: string; name: string }[];
  saved: Record<string, PetState>;
  note: string;
  photos: { id: string; url: string; tags: string[] }[];
  voiceReady: boolean;
}) {
  const storageKey = `stay-update:${updateId}`;
  const single = pets.length === 1 ? pets[0].id : null;
  const [draft, setDraft] = useState<Draft>(() => ({
    pets: Object.fromEntries(pets.map((p) => [p.id, saved[p.id] ?? { counts: {}, scores: {} }])),
    note,
    tags: Object.fromEntries(initialPhotos.map((ph) => [ph.id, ph.tags.length ? ph.tags : single ? [single] : []])),
    filled: [],
    touched: [],
  }));
  const [loaded, setLoaded] = useState(false);
  const [undo, setUndo] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posting, startPost] = useTransition();
  const queue = usePhotoQueue({ stayUpdateId: updateId }, walkerId);

  useEffect(() => {
    try {
      const s = localStorage.getItem(storageKey);
      if (s) {
        const d = JSON.parse(s) as Draft;
        setDraft((cur) => ({
          ...cur,
          ...d,
          pets: Object.fromEntries(Object.entries(cur.pets).map(([id, p]) => [id, d.pets?.[id] ?? p])),
          tags: { ...cur.tags, ...d.tags },
        }));
      }
    } catch {
      /* private mode or an old draft */
    }
    setLoaded(true);
  }, [storageKey]);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      /* storage blocked */
    }
  }, [draft, loaded, storageKey]);
  useEffect(() => {
    setDraft((d) => {
      const missing = queue.items.filter((i) => !(i.id in d.tags));
      if (!missing.length) return d;
      return { ...d, tags: { ...d.tags, ...Object.fromEntries(missing.map((i) => [i.id, single ? [single] : []])) } };
    });
  }, [queue.items, single]);

  const filled = useMemo(() => new Set(draft.filled), [draft.filled]);
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
      const next = { ...d.pets };
      for (const f of fill.pets) {
        const cur = next[f.id];
        if (!cur) continue;
        const p = { counts: { ...cur.counts }, scores: { ...cur.scores } };
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
        next[f.id] = p;
      }
      let noteNext = d.note;
      if (fill.summary) {
        noteNext = d.note.trim() ? `${d.note.trim()}\n\n${fill.summary}` : fill.summary;
        marks.add("note");
      }
      return { ...d, pets: next, note: noteNext, filled: [...marks] };
    });
  }

  const allPhotos = [...initialPhotos.map((p) => ({ id: p.id, url: p.url, status: "done" as const })), ...queue.items];

  function post() {
    setError(null);
    const payload: StayUpdatePayload = {
      pets: pets.map((p) => ({ id: p.id, counts: draft.pets[p.id]?.counts ?? {}, scores: draft.pets[p.id]?.scores ?? {} })),
      photos: allPhotos.filter((p) => p.status === "done").map((p) => ({ id: p.id, petIds: draft.tags[p.id] ?? [] })),
      note: draft.note,
    };
    startPost(async () => {
      try {
        const r = await postStayUpdate(updateId, payload);
        if (r?.error) setError(r.error);
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) {
          try {
            localStorage.removeItem(storageKey); // posted: the draft is done
          } catch {}
          throw e;
        }
        setError(navigator.onLine ? "Couldn't post. Try again." : "No signal. Your update is saved on this phone; tap Post again when you have signal.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4" data-daily-update>
      <div>
        <h1 className="text-2xl font-semibold">{dayLabel}</h1>
        <p className="text-sm text-muted">
          Daily update for {clientName}. {posted ? "Posted; changes go out when you post again." : "Nothing is sent until you tap Post."}
        </p>
      </div>

      <TalkItThrough
        ready={voiceReady}
        interpret={(t) => interpretStayUpdate(updateId, t)}
        example="e.g. “Rex ate breakfast and dinner, had his pill, two walks and lots of fetch. Slept great, a bit mopey this morning.”"
        emptyPrompt="Say how the day went first."
        fillLabel="Fill in the update"
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

      {pets.map((p) => {
        const st = draft.pets[p.id];
        if (!st) return null;
        return (
          <section key={p.id} aria-label={p.name} data-pet-update={p.name}>
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
        groupHint="Tap the pets in each photo. A photo with none tagged shows for the whole stay."
      />

      <SectionTitle>Note for {clientName}</SectionTitle>
      <div className={filled.has("note") ? "rounded-xl ring-2 ring-voice ring-offset-2 ring-offset-bg" : ""}>
        <VoiceInput
          value={draft.note}
          onValueChange={(v) => edit("note", (d) => ({ ...d, note: v }))}
          rows={3}
          placeholder="Optional. Tap the mic and talk, or type."
          aria-label={`Note for ${clientName}`}
        />
      </div>

      <ErrorText>{error}</ErrorText>
      <Button className="h-16 text-lg" disabled={posting || queue.pending > 0} onClick={post} data-post-update>
        {posting ? "Posting…" : queue.pending ? `Waiting for ${queue.pending} photo${queue.pending === 1 ? "" : "s"}…` : posted ? "Post changes" : "Post update"}
      </Button>
      <BackBar href={`/boarding/${stayId}`} label="Stay" />
    </div>
  );
}
