"use client";

import { useEffect, useRef } from "react";

type Fields = Record<string, string | boolean>;
const SKIP = new Set(["hidden", "password", "file", "submit", "button"]);

/**
 * Put inside a <form>: whatever is typed is kept on this phone (localStorage)
 * as it's typed, and put back if the app is closed or reloaded before sending.
 * Cleared when `done` changes to something truthy (a form that stays on the
 * page), or when the page moves on after a submit (a form that redirects).
 * Also puts the text back if a failed send resets the form.
 */
export function FormDraft({ id, done }: { id: string; done?: unknown }) {
  const ref = useRef<HTMLSpanElement>(null);
  const key = `draft:${id}`;
  const doneRef = useRef(done);
  doneRef.current = done;

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    let submitted = false;
    let doneAtSubmit: unknown = undefined;
    const fields = () => Array.from(form.elements).filter((el): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement => "name" in el && !!(el as HTMLInputElement).name && !SKIP.has((el as HTMLInputElement).type));
    const save = () => {
      const data: Fields = {};
      for (const el of fields()) data[el.name] = el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio") ? el.checked : el.value;
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch {}
    };
    const restore = () => {
      let data: Fields | null = null;
      try {
        data = JSON.parse(localStorage.getItem(key) ?? "null");
      } catch {}
      if (!data) return;
      for (const el of fields()) {
        if (!(el.name in data)) continue;
        const v = data[el.name];
        if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
          if (el.checked !== v) el.click();
          continue;
        }
        if (el.value === v) continue;
        // Set it the way typing would, so React state (controlled or not) follows.
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, String(v));
        el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
      }
    };
    const onSubmit = () => {
      submitted = true;
      doneAtSubmit = doneRef.current;
    };
    // React resets the form after a send. Sent (done changed): the draft is finished.
    // Not sent: put the text back.
    const onReset = () =>
      setTimeout(() => {
        if (doneRef.current && doneRef.current !== doneAtSubmit) {
          try {
            localStorage.removeItem(key);
          } catch {}
        } else restore();
      }, 0);
    restore();
    form.addEventListener("input", save);
    form.addEventListener("change", save);
    form.addEventListener("submit", onSubmit);
    form.addEventListener("reset", onReset);
    return () => {
      form.removeEventListener("input", save);
      form.removeEventListener("change", save);
      form.removeEventListener("submit", onSubmit);
      form.removeEventListener("reset", onReset);
      // Left the page after sending (with signal): it went through.
      if (submitted && navigator.onLine) {
        try {
          localStorage.removeItem(key);
        } catch {}
      }
    };
  }, [key]);

  useEffect(() => {
    if (!done) return;
    try {
      localStorage.removeItem(key);
    } catch {}
  }, [done, key]);

  return <span ref={ref} hidden />;
}
