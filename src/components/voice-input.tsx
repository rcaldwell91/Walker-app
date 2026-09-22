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
 * Textarea with a mic button. Talk, and it types. Works in Chrome and Safari
 * (iOS 14.5+). Where speech isn't supported the mic button hides and it's a
 * normal textarea. Raw transcript is submitted alongside via `${name}_raw`.
 */
export function VoiceInput({
  name,
  defaultValue = "",
  placeholder,
  rows = 4,
  autoFocus,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [interim, setInterim] = useState("");
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const rawRef = useRef<string[]>([]);

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
        if (r.isFinal) {
          rawRef.current.push(t);
          setValue((v) => (v ? `${v.trim()} ${t.trim()}` : t.trim()));
        } else interimText += t;
      }
      setInterim(interimText);
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
    };
    rec.onerror = () => {
      setListening(false);
      setInterim("");
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  function stop() {
    recRef.current?.stop();
    setListening(false);
  }

  return (
    <div className="relative">
      <textarea
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
        className={`${inputClass} ${supported ? "pr-14" : ""}`}
      />
      <input type="hidden" name={`${name}_raw`} value={rawRef.current.join(" ")} readOnly />
      {interim ? <p className="mt-1 text-sm italic text-muted">{interim}…</p> : null}
      {supported ? (
        <button
          type="button"
          onClick={listening ? stop : start}
          aria-label={listening ? "Stop listening" : "Talk instead of typing"}
          className={`absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full ${
            listening ? "animate-pulse bg-warn text-white" : "bg-accent text-accent-fg"
          }`}
        >
          <MicIcon />
        </button>
      ) : null}
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v5M8 22h8" />
    </svg>
  );
}
