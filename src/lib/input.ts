/**
 * Tidy what people type, on the server, instead of making the browser refuse it.
 * Forms never use browser validation (every <form> has noValidate): nobody
 * should see "Please match the requested format". Fix what we can silently;
 * otherwise the action returns one plain line saying what to type.
 */

/** Public page links: lowercase letters, numbers and dashes, 3–30 long. */
export const HANDLE_RE = /^[a-z0-9-]{3,30}$/;

/**
 * Anything typed into a handle box, made into a handle: capitals lowered,
 * spaces / dots / underscores to dashes, everything else dropped. Pasting the
 * whole link (…/w/lyon) or "@lyon" works too.
 */
export function cleanHandle(raw: string): string {
  let s = String(raw ?? "").trim();
  const fromLink = s.match(/\/w\/([^/?#\s]+)/i);
  if (fromLink) s = fromLink[1];
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // é → e
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/['’]/g, "") // o'brien → obrien
    .replace(/[\s._]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30)
    .replace(/-$/, "");
}

/** A starting handle from a person's name: "Lyon" → "lyon", "Mary Jo Smith" → "mary-jo-smith". */
export function handleFromName(name: string): string {
  const base = cleanHandle(name);
  if (base.length >= 3) return base;
  return base ? `${base}-walks` : "walker";
}

/** "lyon", "lyon-2", "lyon-3", … each one fits in 30 characters. */
export function handleCandidate(base: string, n: number): string {
  if (n <= 1) return base;
  const suffix = `-${n}`;
  return base.slice(0, 30 - suffix.length).replace(/-$/, "") + suffix;
}

/** Spaces around (or inside) an email are dropped; capitals lowered. */
export function cleanEmail(raw: string): string {
  return String(raw ?? "").replace(/\s+/g, "").toLowerCase();
}

export function looksLikeEmail(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}

/**
 * Brackets, dashes, dots and spaces in a phone number are fine. US numbers are
 * stored as 555-123-4567; anything else keeps its digits (and a leading +).
 * Returns null for blank, or an error line if it can't be a phone number.
 */
export function cleanPhone(raw: string): { phone: string | null; error?: string } {
  const s = String(raw ?? "").trim();
  if (!s) return { phone: null };
  if (/[a-z]/i.test(s.replace(/\b(ext|x)\.?\s*\d+$/i, ""))) return { phone: null, error: "Phone: numbers only, like 555-123-4567" };
  const plus = s.startsWith("+");
  let digits = s.replace(/\D/g, "");
  if (digits.length < 7) return { phone: null, error: "That phone number looks short. Type all of it, like 555-123-4567" };
  if (digits.length > 15) return { phone: null, error: "That phone number looks too long. Type just one number" };
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length === 10 && (!plus || s.startsWith("+1"))) return { phone: `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` };
  return { phone: plus ? `+${digits}` : digits };
}

/** "$45", "45.00", " 1,200 ", "about 40 lbs" → the number in it; null if there isn't one. */
export function toNumber(raw: unknown): number | null {
  const m = String(raw ?? "").replace(/,/g, "").match(/-?\d+(\.\d+)?|-?\.\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}
