"use server";

import { getSession } from "@/lib/session";
import { isValidTimeZone } from "@/lib/time";

/** Remember the person's time zone so the database can tell which day things happen on (billing, check-ins). */
/** True once it's on the profile; false when there's no one logged in yet (try again later). */
export async function saveTimeZone(tz: string): Promise<boolean> {
  if (!isValidTimeZone(tz)) return true;
  const s = await getSession();
  if (!s) return false;
  const { error } = await s.supabase.from("profiles").update({ time_zone: tz }).eq("id", s.user.id);
  return !error;
}
