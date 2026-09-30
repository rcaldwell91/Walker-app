"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { stash } from "@/lib/offline";
import { Button, Card } from "@/components/ui";
import { useSpeechToText } from "@/components/voice-input";
import { EVENT_EMOJI, EVENT_LABELS } from "@/lib/events";
import { PET_SCORES } from "@/lib/pet-scores";
import type { VoiceFill, VoiceResult } from "@/lib/voice-fill";

/**
 * The pieces a walk wrap-up and a boarding daily update share: one-tap log
 * buttons, 1–5 ratings, the photo gallery with pet tags, and "Talk it through".
 * Anything outlined in the voice colour was filled from what the walker said.
 */

const voiceRing = "ring-2 ring-voice ring-offset-2 ring-offset-card";

export function LogGrid({
  pet,
  buttons,
  counts,
  filled,
  onChange,
}: {
  pet: string;
  buttons: string[];
  counts: Record<string, number>;
  filled: (button: string) => boolean;
  onChange: (button: string, n: number) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {buttons.map((b) => {
        const n = counts[b] ?? 0;
        return (
          <div key={b} className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => onChange(b, Math.min(20, n + 1))}
              className={`flex h-20 w-full flex-col items-center justify-center rounded-2xl border-2 px-1 text-sm font-medium leading-tight active:scale-95 ${
                n ? "border-accent bg-accent/10" : "border-border bg-bg"
              } ${filled(b) ? voiceRing : ""}`}
              data-log={b}
              data-count={n}
            >
              <span className="text-2xl" aria-hidden="true">
                {EVENT_EMOJI[b] ?? "•"}
              </span>
              <span className="line-clamp-1">{EVENT_LABELS[b] ?? b}</span>
              {/* The count has its own line, so nothing moves when it appears. */}
              <span className="h-4 text-xs tabular-nums">{n ? `×${n}` : ""}</span>
            </button>
            {/* "−" sits in its own slot under the button, never over it, and the slot is always there. */}
            <button
              type="button"
              aria-label={`${pet}: one less ${EVENT_LABELS[b] ?? b}`}
              onClick={() => onChange(b, Math.max(0, n - 1))}
              disabled={!n}
              className={`h-9 rounded-xl border border-border text-lg leading-none ${n ? "bg-card" : "invisible"}`}
              data-minus={b}
            >
              −
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function ScoreGrid({
  pet,
  scores,
  filled,
  onChange,
}: {
  pet: string;
  scores: Record<string, number>;
  filled: (category: string) => boolean;
  /** undefined clears the rating */
  onChange: (category: string, score: number | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {PET_SCORES.map((sc) => {
        const v = scores[sc.key];
        return (
          <div key={sc.key} data-score={sc.key} className={filled(sc.key) ? `rounded-xl ${voiceRing}` : ""}>
            <p className="mb-1 flex justify-between text-sm">
              <span className="font-medium">{sc.label}</span>
              <span className="text-xs text-muted">
                1 {sc.low} · 5 {sc.high}
              </span>
            </p>
            <div className="grid grid-cols-5 gap-1" role="radiogroup" aria-label={`${pet}: ${sc.label}`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={v === n}
                  onClick={() => onChange(sc.key, v === n ? undefined : n)}
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
  );
}

export type GalleryPhoto = { id: string; url: string; status: "done" | "uploading" | "queued" | "error" };

export function PhotoGallery({
  photos,
  pets,
  tags,
  onToggleTag,
  onFiles,
  onRetry,
  groupHint,
}: {
  photos: GalleryPhoto[];
  onRetry: (photoId: string) => void;
  pets: { id: string; name: string }[];
  tags: Record<string, string[]>;
  onToggleTag: (photoId: string, petId: string) => void;
  onFiles: (f: FileList | null) => void;
  groupHint: string;
}) {
  return (
    <Card className="flex flex-col gap-3">
      {photos.length ? (
        <ul className="grid grid-cols-2 gap-3" aria-label="Photos">
          {photos.map((ph) => {
            const on = tags[ph.id] ?? [];
            return (
              <li key={ph.id} className="flex flex-col gap-2" data-photo={ph.id}>
                <div className="relative aspect-square overflow-hidden rounded-xl bg-border">
                  {ph.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ph.url} alt="" className="h-full w-full object-cover" />
                  ) : null}
                  {ph.status === "error" ? (
                    <button type="button" onClick={() => onRetry(ph.id)} className="absolute inset-x-0 bottom-0 min-h-11 bg-black/70 px-1 text-center text-xs font-medium text-white" data-retry-photo>
                      Didn&apos;t send. Tap to try again
                    </button>
                  ) : ph.status !== "done" ? (
                    <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-1 text-center text-xs text-white">
                      {ph.status === "uploading" ? "Sending…" : "Sends when you have signal"}
                    </span>
                  ) : null}
                </div>
                {pets.length > 1 ? (
                  <div className="flex flex-wrap gap-1">
                    {pets.map((p) => {
                      const tagged = on.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          aria-pressed={tagged}
                          onClick={() => onToggleTag(ph.id, p.id)}
                          className={`min-h-11 rounded-full border px-3 text-sm ${tagged ? "border-accent bg-accent text-accent-fg" : "border-border bg-bg"}`}
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
      {pets.length > 1 ? <p className="text-xs text-muted">{groupHint}</p> : null}
      <PhotoButton onFiles={onFiles} />
    </Card>
  );
}

export function PhotoButton({ onFiles }: { onFiles: (f: FileList | null) => void }) {
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
 * the server asks Claude to fill the form in. Without an API key it says
 * "Needs setup" and everything else works as usual.
 */
export function TalkItThrough({
  ready,
  interpret,
  example,
  emptyPrompt,
  fillLabel,
  onFill,
  draftKey,
}: {
  /** Keeps what was said on the phone until the report is sent. */
  draftKey: string;
  ready: boolean;
  interpret: (text: string) => Promise<VoiceResult>;
  example: string;
  emptyPrompt: string;
  fillLabel: string;
  onFill: (f: VoiceFill) => void;
}) {
  const [text, setTextState] = useState("");
  const setText = (v: string | ((cur: string) => string)) =>
    setTextState((cur) => {
      const next = typeof v === "function" ? v(cur) : v;
      stash.set(draftKey, next);
      return next;
    });
  useEffect(() => {
    const saved = stash.get<string>(draftKey, "");
    if (saved) setTextState(saved);
  }, [draftKey]);
  const [msg, setMsg] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(!ready);
  const [pending, start] = useTransition();
  const textRef = useRef(text);
  textRef.current = text;
  const speech = useSpeechToText((t) => setText((v) => (v ? `${v.trim()} ${t}` : t)));

  if (needsSetup) {
    return (
      <button type="button" disabled className="btn flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-base text-muted" data-voice="needs-setup">
        🎙️ Talk it through · Needs setup
      </button>
    );
  }

  function fill() {
    const said = textRef.current.trim();
    if (!said) return setMsg(emptyPrompt);
    speech.stop();
    setMsg(null);
    start(async () => {
      try {
        const r = await interpret(said);
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
          speech.listening ? "animate-pulse bg-voice text-bg" : "bg-accent text-accent-fg"
        }`}
      >
        🎙️ {speech.listening ? "Listening… tap to stop" : "Talk it through"}
      </button>
      <p className="text-xs text-muted">
        {speech.blocked
          ? "Can't use the microphone. Type the rundown below instead, or allow it in settings."
          : speech.supported
          ? example
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
            {pending ? "Filling in…" : fillLabel}
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

/** "Filled in N things" with Undo, under Talk it through. */
export function VoiceFilledBar({ count, onUndo }: { count: number; onUndo: () => void }) {
  return (
    <Card className="flex items-center justify-between gap-2 border-voice" data-voice-filled={count}>
      <p className="text-sm">
        <span className="font-medium text-voice">
          Filled in {count} thing{count === 1 ? "" : "s"} from what you said.
        </span>{" "}
        <span className="text-muted">Outlined below. Check them before you send.</span>
      </p>
      <Button variant="secondary" className="shrink-0 px-3 text-sm" onClick={onUndo}>
        Undo
      </Button>
    </Card>
  );
}
