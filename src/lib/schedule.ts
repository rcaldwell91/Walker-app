/**
 * Bookings are stored once; a repeating booking has repeat_weekdays (ISO,
 * 1 = Mon … 7 = Sun) and an optional repeat_until. Occurrences are worked out
 * here, in the walker's time zone, at the same wall-clock time as starts_at.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, dateKey, isoWeekday, timeOfDay, zonedToUtc } from "./time";

export type BookingBase = {
  id: string;
  starts_at: string;
  repeat_weekdays: number[] | null;
  repeat_until: string | null;
};

export type Occurrence<T> = { booking: T; at: Date; day: string };

/** Occurrences of `bookings` on days fromDay (inclusive) to toDay (exclusive). */
export function occurrencesBetween<T extends BookingBase>(bookings: T[], fromDay: string, toDay: string, tz: string): Occurrence<T>[] {
  const out: Occurrence<T>[] = [];
  for (const b of bookings) {
    const start = new Date(b.starts_at);
    const startDay = dateKey(start, tz);
    const days = b.repeat_weekdays ?? [];
    if (!days.length) {
      if (startDay >= fromDay && startDay < toDay) out.push({ booking: b, at: start, day: startDay });
      continue;
    }
    const { hh, mm } = timeOfDay(start, tz);
    let day = startDay > fromDay ? startDay : fromDay;
    const last = b.repeat_until && b.repeat_until < toDay ? addDays(b.repeat_until, 1) : toDay;
    for (; day < last; day = addDays(day, 1)) {
      if (days.includes(isoWeekday(day))) out.push({ booking: b, at: zonedToUtc(day, hh, mm, tz), day });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export const BOOKING_FIELDS =
  "id, starts_at, duration_min, status, repeat_weekdays, repeat_until, client:clients(id, name, color), service:service_types(name), booking_dogs(dog:dogs(id, name))";

/**
 * Non-cancelled bookings that can have an occurrence between fromDay and toDay:
 * one-offs inside the range, and repeats that started before its end and
 * haven't ended before its start.
 */
export async function fetchBookingsForRange(supabase: SupabaseClient, fromDay: string, toDay: string, tz: string) {
  const from = zonedToUtc(fromDay, 0, 0, tz).toISOString();
  const to = zonedToUtc(toDay, 0, 0, tz).toISOString();
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_FIELDS)
    .neq("status", "cancelled")
    .lt("starts_at", to)
    .or(`starts_at.gte.${from},and(repeat_weekdays.neq.{},or(repeat_until.is.null,repeat_until.gte.${fromDay}))`)
    .order("starts_at");
  if (error) throw new Error(error.message);
  return data ?? [];
}
