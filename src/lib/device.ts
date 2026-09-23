export type Platform = "ios" | "android" | "other";

/** Which install instructions to show, from the browser's user agent. */
export function platformFrom(ua: string | null | undefined): Platform {
  const s = ua ?? "";
  if (/iPhone|iPad|iPod/i.test(s)) return "ios";
  if (/Android/i.test(s)) return "android";
  return "other";
}
