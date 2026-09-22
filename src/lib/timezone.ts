import { cookies } from "next/headers";
import { DEFAULT_TZ, isValidTimeZone, TZ_COOKIE } from "./time";

/** The signed-in person's time zone, as reported by their browser. Server only. */
export async function getTimeZone() {
  const tz = (await cookies()).get(TZ_COOKIE)?.value;
  return isValidTimeZone(tz) ? tz : DEFAULT_TZ;
}
