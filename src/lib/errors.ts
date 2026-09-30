/**
 * What a person sees when something fails. Messages the database raises on
 * purpose (our own functions and guards, code P0001) are written for people
 * and pass through; anything technical is logged and replaced with one plain line.
 */
export function friendly(e: { message?: string; code?: string } | null | undefined, fallback = "Couldn't save. Try again."): string {
  if (!e) return fallback;
  if (e.code === "P0001" && e.message) return e.message;
  console.error("[action error]", e.code ?? "", e.message ?? e);
  return fallback;
}
