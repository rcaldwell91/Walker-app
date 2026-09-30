"use client";

/**
 * Run a server action from a tap. With no signal the action throws instead of
 * returning; this turns that into one plain line, so the screen stays put and
 * the walker can tap again. Redirects (success) pass through.
 */
export async function tap<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) throw e;
    return { error: navigator.onLine ? "Didn't go through. Tap again." : "No signal. Tap again when you have a bar." };
  }
}

export const errorOf = (r: unknown) => (r && typeof r === "object" && "error" in r && typeof (r as { error?: unknown }).error === "string" ? (r as { error: string }).error : null);

/** A small list kept on the phone (localStorage). Silently does nothing where storage is blocked. */
export const stash = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key);
      return v ? (JSON.parse(v) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      if (value === null || (Array.isArray(value) && !value.length) || value === "") localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage blocked */
    }
  },
};
