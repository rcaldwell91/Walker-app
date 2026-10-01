"use client";

import { forwardRef, useRef, useState, type ComponentProps, type FormEvent } from "react";
import { Button, Field, inputClass } from "./ui";

/**
 * A password box with a show/hide eye. Hidden to start. The eye sits inside the
 * box (the box keeps room for it), so showing or hiding never moves anything.
 */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<ComponentProps<"input">, "type">>(function PasswordInput(
  { className = "", ...props },
  ref,
) {
  const [shown, setShown] = useState(false);
  return (
    <span className="relative block">
      <input ref={ref} type={shown ? "text" : "password"} autoCapitalize="none" autoCorrect="off" spellCheck={false} className={`${inputClass} min-h-11 pr-12 ${className}`} {...props} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-muted"
        data-eye
      >
        {shown ? (
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3l18 18" />
            <path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.3 2.4-2.6 3.7M6.6 6.6C4.4 8 2.8 10.2 2 12c1 2.5 5 7 10 7 1.8 0 3.4-.6 4.8-1.4" />
            <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </span>
  );
});

export const MISMATCH = "These don't match. Type the same password in both boxes.";
export const BREACH_WARNING = "This password has shown up in a known data breach. It still works here, but it's safer to pick another.";

/**
 * The submit button of a form that sets a password. If the password has shown
 * up in a breach, the same slot becomes "Pick another" / "Use it anyway"
 * (same height, nothing below the finger moves), and the line under it says why.
 * Never refuses the password.
 */
export function PasswordSubmit({
  warn,
  pending,
  label,
  pendingLabel,
  error,
  mismatch = false,
  onPickAnother,
}: {
  warn: boolean;
  pending: boolean;
  label: string;
  pendingLabel: string;
  error?: string | null;
  /** The two password boxes differ: say so in the same reserved line, nothing else changes. */
  mismatch?: boolean;
  onPickAnother: () => void;
}) {
  return (
    <>
      {warn ? (
        <div className="grid h-12 grid-cols-2 gap-2">
          <Button type="button" variant="secondary" onClick={onPickAnother} disabled={pending} className="h-12" data-pick-another>
            Pick another
          </Button>
          <Button type="submit" name="breach_ok" value="1" disabled={pending} className="h-12" data-use-anyway>
            {pending ? pendingLabel : "Use it anyway"}
          </Button>
        </div>
      ) : (
        <Button type="submit" disabled={pending} className="h-12" data-submit>
          {pending ? pendingLabel : label}
        </Button>
      )}
      {/* Room for three lines is always kept, so the warning never pushes anything. */}
      <p className={`min-h-[3.75rem] text-sm ${mismatch || error || warn ? "text-warn" : "text-muted"}`} role="status" data-breach-warning={warn && !mismatch ? "" : undefined} data-mismatch={mismatch ? "" : undefined}>
        {mismatch ? MISMATCH : error || (warn ? BREACH_WARNING : "")}
      </p>
    </>
  );
}

/** Warn state for a password form: on when the action says so, off as soon as the password changes. */
export function useBreachWarning(state: { breached?: boolean } | undefined) {
  const [warnFor, setWarnFor] = useState<object | undefined>(undefined);
  const warn = !!state?.breached && warnFor !== state;
  return { warn, clear: () => setWarnFor(state) };
}

/**
 * A new password typed twice ("Password" + "Type it again"), each with its own eye.
 * If the two differ, the form isn't sent: the line under the button says so and
 * nothing typed is cleared. The breach check is on the first box and only warns.
 */
export function useNewPassword(state: { breached?: boolean } | undefined) {
  const breach = useBreachWarning(state);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  return {
    password,
    warn: breach.warn,
    mismatch,
    /** Put on the <form>: stops the send when the two boxes differ. */
    onSubmit: (e: FormEvent<HTMLFormElement>) => {
      if (password !== confirm) {
        e.preventDefault();
        setMismatch(true);
      }
    },
    pickAnother: () => {
      breach.clear();
      setMismatch(false);
      setPassword("");
      setConfirm("");
      first.current?.focus();
    },
    fields: ({ label, hint }: { label: string; hint: string }) => (
      <>
        <Field label={label} hint={hint}>
          <PasswordInput
            ref={first}
            name="password"
            value={password}
            onChange={(e) => {
              breach.clear();
              setMismatch(false);
              setPassword(e.target.value);
            }}
            autoComplete="new-password"
            data-password
          />
        </Field>
        <Field label="Type it again">
          <PasswordInput
            name="password_confirm"
            value={confirm}
            onChange={(e) => {
              setMismatch(false);
              setConfirm(e.target.value);
            }}
            autoComplete="new-password"
            data-password-confirm
          />
        </Field>
      </>
    ),
  };
}
