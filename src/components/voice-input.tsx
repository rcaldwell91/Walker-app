"use client";

import { useEffect, useRef, useState } from "react";
import { inputClass } from "@/components/ui";

/* Minimal typing for the Web Speech API (not in lib.dom for all TS targets). */
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

/**
 * Browser speech-to-text (Web Speech API). Works in Chrome and Safari (iOS 14.5+).
 * `onFinal` gets each finished phrase; `interim` is what's being heard right now.
 */
export function useSpeechToText(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [interim, setInterim] = useState("");
  const [blocked, setBlocked] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    setSupported(!!getRecognition());
  }, []);

  function start() {
    const rec = getRecognition();
    if (!rec) return;
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0].transcript;
        if (r.isFinal) onFinalRef.current(t.trim());
        else interimText += t;
      }
      setInterim(interimText);
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
    };
    rec.onerror = (e) => {
      setListening(false);
      setInterim("");
      // Mic refused, or no mic at all: say so, and typing still works.
      if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") setBlocked(true);
    };
    recRef.current = rec;
    setBlocked(false);
    rec.start();
    setListening(true);
  }

  function stop() {
    recRef.current?.stop();
    setListening(false);
  }

  return { supported, listening, interim, blocked, start, stop };
}

/**
 * Textarea with a mic button. Talk, and it types. Where speech isn't supported
 * the mic button hides and it's a normal textarea. Raw transcript is submitted
 * alongside via `${name}_raw`. Pass `value` and `onValueChange` to control it.
 */
export function VoiceInput({
  name,
  defaultValue = "",
  value: controlled,
  onValueChange,
  placeholder,
  rows = 4,
  autoFocus,
  className = "",
  ...rest
}: {
  name?: string;
  defaultValue?: string;
  value?: string;
  onValueChange?: (v: string) => void;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [own, setOwn] = useState(defaultValue);
  const value = controlled ?? own;
  const valueRef = useRef(value);
  valueRef.current = value;
  const set = (v: string) => {
    if (controlled === undefined) setOwn(v);
    onValueChange?.(v);
  };
  const rawRef = useRef<string[]>([]);
  const speech = useSpeechToText((t) => {
    rawRef.current.push(t);
    const v = valueRef.current;
    set(v ? `${v.trim()} ${t}` : t);
  });

  return (
    <div className="relative">
      <textarea
        name={name}
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
        aria-label={rest["aria-label"]}
        className={`${inputClass} ${speech.supported ? "pr-14" : ""} ${className}`}
      />
      {name ? <input type="hidden" name={`${name}_raw`} value={rawRef.current.join(" ")} readOnly /> : null}
      {speech.interim ? <p className="mt-1 text-sm italic text-muted">{speech.interim}…</p> : null}
      {speech.blocked ? <p className="mt-1 text-sm text-warn">Can&apos;t use the microphone. Type instead, or allow it in settings.</p> : null}
      {speech.supported ? (
        <button
          type="button"
          onClick={speech.listening ? speech.stop : speech.start}
          aria-label={speech.listening ? "Stop listening" : "Talk instead of typing"}
          className={`absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full ${
            speech.listening ? "animate-pulse bg-warn text-warn-fg" : "bg-accent text-accent-fg"
          }`}
        >
          <MicIcon />
        </button>
      ) : null}
    </div>
  );
}

export function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v5M8 22h8" />
    </svg>
  );
}
