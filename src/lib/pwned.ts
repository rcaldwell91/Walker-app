import { createHash } from "node:crypto";

/**
 * Has this password shown up in a known data breach? (HaveIBeenPwned's range API.)
 * Only the first 5 characters of the password's SHA-1 hash are sent; the rest
 * is matched here. The password and its full hash never leave the app.
 *
 * Returns true / false, or null when we couldn't tell (no connection, slow,
 * any error). Callers carry on as if it were fine: this only ever warns.
 */
export async function isPwnedPassword(password: string, timeoutMs = 2500): Promise<boolean | null> {
  if (!password) return null;
  try {
    const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
    const prefix = hash.slice(0, 5);
    const rest = hash.slice(5);
    const base = process.env.PWNED_RANGE_URL || "https://api.pwnedpasswords.com/range/";
    const res = await fetch(`${base}${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "walker-app" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = await res.text();
    for (const line of body.split("\n")) {
      const [suffix, count] = line.trim().split(":");
      // Padding lines have a count of 0.
      if (suffix === rest) return Number(count) > 0;
    }
    return false;
  } catch {
    return null;
  }
}
