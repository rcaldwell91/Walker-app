"use client";

import { useEffect, useState } from "react";
import type { Platform } from "@/lib/device";
import { Button } from "@/components/ui";

type Step = { title: string; body: string; art: React.ReactNode };

/** A phone outline with the thing to tap circled. */
function Phone({ children, highlight }: { children: React.ReactNode; highlight?: { x: number; y: number; r?: number } }) {
  return (
    <svg viewBox="0 0 120 200" className="mx-auto h-40 w-auto" aria-hidden="true">
      <rect x="6" y="4" width="108" height="192" rx="18" fill="var(--card)" stroke="var(--fg)" strokeWidth="3" />
      <rect x="14" y="20" width="92" height="160" rx="6" fill="var(--bg)" />
      {children}
      {highlight ? (
        <circle cx={highlight.x} cy={highlight.y} r={highlight.r ?? 11} fill="none" stroke="#b3541e" strokeWidth="3">
          <animate attributeName="r" values={`${highlight.r ?? 11};${(highlight.r ?? 11) + 3};${highlight.r ?? 11}`} dur="1.4s" repeatCount="indefinite" />
        </circle>
      ) : null}
    </svg>
  );
}

const ShareIcon = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x - 6} ${y - 7})`} stroke="#2b6cb0" strokeWidth="1.8" fill="none" strokeLinecap="round">
    <path d="M2 6v7h8V6" />
    <path d="M6 1v8M3 4l3-3 3 3" />
  </g>
);

const IOS_STEPS: Step[] = [
  {
    title: "Open this page in Safari",
    body: "Home-screen apps on iPhone come from Safari. If you're in another app or browser, open this link in Safari first.",
    art: (
      <Phone highlight={{ x: 60, y: 100, r: 22 }}>
        <circle cx="60" cy="100" r="16" fill="none" stroke="#2b6cb0" strokeWidth="2.5" />
        <path d="M60 88l4 12-4 12-4-12z" fill="#b3541e" />
      </Phone>
    ),
  },
  {
    title: "Tap the Share button",
    body: "It's the square with an arrow pointing up, at the bottom of the screen (at the top on iPad).",
    art: (
      <Phone highlight={{ x: 60, y: 168 }}>
        <rect x="14" y="156" width="92" height="24" fill="var(--card)" />
        <ShareIcon x={60} y={168} />
        <text x="26" y="172" fontSize="10" fill="var(--muted)">‹</text>
        <text x="90" y="172" fontSize="10" fill="var(--muted)">⧉</text>
      </Phone>
    ),
  },
  {
    title: "Tap “Add to Home Screen”",
    body: "Scroll down the list if you don't see it right away.",
    art: (
      <Phone highlight={{ x: 60, y: 118, r: 14 }}>
        <rect x="18" y="70" width="84" height="100" rx="6" fill="var(--card)" stroke="var(--border)" />
        <text x="24" y="90" fontSize="7" fill="var(--muted)">Copy</text>
        <text x="24" y="104" fontSize="7" fill="var(--muted)">Add to Reading List</text>
        <text x="24" y="121" fontSize="7" fill="var(--fg)" fontWeight="bold">Add to Home Screen</text>
        <rect x="88" y="113" width="10" height="10" rx="2" fill="none" stroke="var(--fg)" />
        <path d="M93 115v6M90 118h6" stroke="var(--fg)" />
        <text x="24" y="138" fontSize="7" fill="var(--muted)">Markup</text>
      </Phone>
    ),
  },
  {
    title: "Tap “Add”",
    body: "The Walker icon appears on your home screen. Open the app from there from now on.",
    art: (
      <Phone highlight={{ x: 94, y: 30, r: 9 }}>
        <text x="20" y="33" fontSize="7" fill="#2b6cb0">Cancel</text>
        <text x="88" y="33" fontSize="7" fill="#2b6cb0" fontWeight="bold">Add</text>
        <rect x="46" y="52" width="28" height="28" rx="7" fill="#2f7d5b" />
        <text x="49" y="95" fontSize="7" fill="var(--fg)">Walker</text>
      </Phone>
    ),
  },
];

const ANDROID_STEPS: Step[] = [
  {
    title: "Open this page in Chrome",
    body: "If you're in another app, open the link in Chrome.",
    art: (
      <Phone highlight={{ x: 60, y: 100, r: 22 }}>
        <circle cx="60" cy="100" r="16" fill="#db4437" />
        <path d="M60 84a16 16 0 0 1 13.9 8H60z" fill="#f4b400" />
        <circle cx="60" cy="100" r="7" fill="#4285f4" stroke="#fff" strokeWidth="2.5" />
      </Phone>
    ),
  },
  {
    title: "Tap the ⋮ menu",
    body: "Three dots in the top-right corner of Chrome.",
    art: (
      <Phone highlight={{ x: 98, y: 30, r: 8 }}>
        <rect x="14" y="20" width="92" height="20" fill="var(--card)" />
        <rect x="20" y="25" width="66" height="10" rx="5" fill="var(--border)" />
        <circle cx="98" cy="26" r="1.4" fill="var(--fg)" />
        <circle cx="98" cy="30" r="1.4" fill="var(--fg)" />
        <circle cx="98" cy="34" r="1.4" fill="var(--fg)" />
      </Phone>
    ),
  },
  {
    title: "Tap “Install app”",
    body: "On some phones it says “Add to Home screen”. Either one works.",
    art: (
      <Phone highlight={{ x: 60, y: 92, r: 14 }}>
        <rect x="40" y="40" width="64" height="100" rx="4" fill="var(--card)" stroke="var(--border)" />
        <text x="46" y="58" fontSize="7" fill="var(--muted)">New tab</text>
        <text x="46" y="74" fontSize="7" fill="var(--muted)">Bookmarks</text>
        <text x="46" y="94" fontSize="7" fill="var(--fg)" fontWeight="bold">Install app</text>
        <text x="46" y="112" fontSize="7" fill="var(--muted)">Share…</text>
      </Phone>
    ),
  },
  {
    title: "Tap “Install”",
    body: "The Walker icon appears with your apps. Open it from there from now on.",
    art: (
      <Phone highlight={{ x: 86, y: 128, r: 10 }}>
        <rect x="20" y="80" width="80" height="60" rx="8" fill="var(--card)" stroke="var(--border)" />
        <rect x="28" y="88" width="16" height="16" rx="4" fill="#2f7d5b" />
        <text x="50" y="99" fontSize="7" fill="var(--fg)">Install app?</text>
        <text x="50" y="131" fontSize="7" fill="var(--muted)">Cancel</text>
        <text x="76" y="131" fontSize="7" fill="#2b6cb0" fontWeight="bold">Install</text>
      </Phone>
    ),
  },
];

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Chrome's own install prompt, when the browser offers one. */
export function useNativeInstallPrompt() {
  const [evt, setEvt] = useState<InstallPromptEvent | null>(null);
  useEffect(() => {
    const w = window as unknown as { __installPrompt?: InstallPromptEvent };
    if (w.__installPrompt) setEvt(w.__installPrompt);
    const on = (e: Event) => {
      e.preventDefault();
      w.__installPrompt = e as InstallPromptEvent;
      setEvt(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", on);
    return () => window.removeEventListener("beforeinstallprompt", on);
  }, []);
  return evt;
}

export function InstallGuide({ platform, onClose }: { platform: Platform; onClose?: () => void }) {
  const [which, setWhich] = useState<"ios" | "android">(platform === "android" ? "android" : "ios");
  const [step, setStep] = useState(0);
  const native = useNativeInstallPrompt();
  const steps = which === "ios" ? IOS_STEPS : ANDROID_STEPS;
  const s = steps[step];

  return (
    <div data-install-guide={which} className="flex flex-col gap-3">
      {platform === "other" ? (
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-bg p-1 text-sm" role="tablist">
          {(["ios", "android"] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={which === p}
              onClick={() => {
                setWhich(p);
                setStep(0);
              }}
              className={`rounded-lg ${which === p ? "bg-card font-medium shadow-sm" : "text-muted"}`}
            >
              {p === "ios" ? "iPhone" : "Android"}
            </button>
          ))}
        </div>
      ) : null}

      {which === "android" && native ? (
        <Button
          type="button"
          className="h-14 text-lg"
          onClick={async () => {
            await native.prompt();
            const { outcome } = await native.userChoice;
            if (outcome === "accepted") onClose?.();
          }}
        >
          Install the app
        </Button>
      ) : null}

      <div className="rounded-2xl border border-border bg-card p-4 text-center" aria-live="polite">
        <p className="text-xs uppercase tracking-wide text-muted">
          Step {step + 1} of {steps.length}
        </p>
        <div className="my-3">{s.art}</div>
        <p className="font-medium">{s.title}</p>
        <p className="mt-1 text-sm text-muted">{s.body}</p>
        {step === 0 ? <AppAddress /> : null}
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="secondary" className="flex-1" disabled={step === 0} onClick={() => setStep(step - 1)}>
          Back
        </Button>
        {step < steps.length - 1 ? (
          <Button type="button" className="flex-1" onClick={() => setStep(step + 1)}>
            Next
          </Button>
        ) : (
          <Button type="button" className="flex-1" onClick={onClose}>
            Done
          </Button>
        )}
      </div>
    </div>
  );
}

/** The app's address, to open in Safari/Chrome if they're somewhere else. */
function AppAddress() {
  const [url, setUrl] = useState(process.env.NEXT_PUBLIC_APP_URL ?? "");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!url) setUrl(window.location.origin);
  }, [url]);
  if (!url) return null;
  return (
    <div className="mt-3 flex items-center justify-center gap-2 text-sm">
      <span className="font-mono" data-app-url>{url.replace(/^https?:\/\//, "")}</span>
      <button
        type="button"
        className="text-accent underline"
        onClick={() => {
          navigator.clipboard?.writeText(url).then(() => setCopied(true), () => {});
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
