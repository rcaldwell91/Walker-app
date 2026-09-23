/**
 * Bookings are stored once; a repeating booking has repeat_weekdays (ISO,
 * 1 = Mon … 7 = Sun) and an optional repeat_until. Occurrences are worked out
 * here, in the walker's time zone, at the same wall-clock time as starts_at.
 * booking_exceptions can skip one occurrence or move it to another time.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, dateKey, isoWeekday, timeOfDay, zonedToUtc } from "./time";

export type BookingBase = {
  id: string;
  starts_at: string;
  duration_min: number;
  repeat_weekdays: number[] | null;
  repeat_until: string | null;
};

export type BookingException = {
  booking_id: string;
  occurs_on: string;
  skipped: boolean;
  moved_to: string | null;
  duration_min: number | null;
};

export type Occurrence<T> = {
  booking: T;
  at: Date;
  /** Day it happens on (after any move). */
  day: string;
  /** Day the series put it on; identifies the occurrence for skip/move. */
  originalDay: string;
  durationMin: number;
  skipped: boolean;
  moved: boolean;
};

/** Series occurrences on days fromDay (inclusive) to toDay (exclusive), ignoring exceptions. */
function seriesDays(b: BookingBase, fromDay: string, toDay: string, tz: string): { day: string; at: Date }[] {
  const start = new Date(b.starts_at);
  const startDay = dateKey(start, tz);
  const days = b.repeat_weekdays ?? [];
  if (!days.length) return startDay >= fromDay && startDay < toDay ? [{ day: startDay, at: start }] : [];
  const { hh, mm } = timeOfDay(start, tz);
  const out: { day: string; at: Date }[] = [];
  let day = startDay > fromDay ? startDay : fromDay;
  const last = b.repeat_until && b.repeat_until < toDay ? addDays(b.repeat_until, 1) : toDay;
  for (; day < last; day = addDays(day, 1)) {
    if (days.includes(isoWeekday(day))) out.push({ day, at: zonedToUtc(day, hh, mm, tz) });
  }
  return out;
}

/** True if the series (ignoring exceptions) has an occurrence on `day`. */
export function isSeriesDay(b: BookingBase, day: string, tz: string) {
  return seriesDays(b, day, addDays(day, 1), tz).length > 0;
}

/**
 * Occurrences between fromDay and toDay, with exceptions applied. Skipped ones
 * are returned with skipped = true (so they can be shown and undone); callers
 * that only want real appointments filter them out.
 */
export function occurrencesBetween<T extends BookingBase>(
  bookings: T[],
  fromDay: string,
  toDay: string,
  tz: string,
  exceptions: BookingException[] = [],
): Occurrence<T>[] {
  const ex = new Map(exceptions.map((e) => [`${e.booking_id}|${e.occurs_on}`, e]));
  const out: Occurrence<T>[] = [];
  for (const b of bookings) {
    for (const { day, at } of seriesDays(b, fromDay, toDay, tz)) {
      const e = ex.get(`${b.id}|${day}`);
      if (e?.moved_to) continue; // shows up on its new day below
      out.push({ booking: b, at, day, originalDay: day, durationMin: b.duration_min, skipped: !!e?.skipped, moved: false });
    }
  }
  // Moved occurrences land wherever they were moved to, even from outside this range.
  const byId = new Map(bookings.map((b) => [b.id, b]));
  for (const e of exceptions) {
    const b = byId.get(e.booking_id);
    if (!b || !e.moved_to) continue;
    const at = new Date(e.moved_to);
    const day = dateKey(at, tz);
    if (day < fromDay || day >= toDay) continue;
    out.push({ booking: b, at, day, originalDay: e.occurs_on, durationMin: e.duration_min ?? b.duration_min, skipped: false, moved: true });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export const BOOKING_FIELDS =
  "id, starts_at, duration_min, status, repeat_weekdays, repeat_until, client:clients(id, name, color), service:service_types(name), booking_dogs(dog:dogs(id, name))";

/**
 * Non-cancelled bookings that can have an occurrence between fromDay and
 * toDay, plus the exceptions that matter for that range: ones on days in the
 * range, and ones moved into it (whose booking is fetched too if needed).
 */
export async function fetchBookingsForRange(supabase: SupabaseClient, fromDay: string, toDay: string, tz: string) {
  const from = zonedToUtc(fromDay, 0, 0, tz).toISOString();
  const to = zonedToUtc(toDay, 0, 0, tz).toISOString();
  const [{ data, error }, { data: exceptions, error: exErr }] = await Promise.all([
    supabase
      .from("bookings")
      .select(BOOKING_FIELDS)
      .neq("status", "cancelled")
      .lt("starts_at", to)
      .or(`starts_at.gte.${from},and(repeat_weekdays.neq.{},or(repeat_until.is.null,repeat_until.gte.${fromDay}))`)
      .order("starts_at"),
    supabase
      .from("booking_exceptions")
      .select("booking_id, occurs_on, skipped, moved_to, duration_min")
      .or(`and(occurs_on.gte.${fromDay},occurs_on.lt.${toDay}),and(moved_to.gte.${from},moved_to.lt.${to})`),
  ]);
  if (error) throw new Error(error.message);
  if (exErr) throw new Error(exErr.message);
  const bookings = data ?? [];
  const have = new Set(bookings.map((b) => b.id));
  const missing = Array.from(new Set((exceptions ?? []).filter((e) => e.moved_to && !have.has(e.booking_id)).map((e) => e.booking_id)));
  if (missing.length) {
    const { data: extra } = await supabase.from("bookings").select(BOOKING_FIELDS).neq("status", "cancelled").in("id", missing);
    bookings.push(...(extra ?? []));
  }
  return { bookings, exceptions: (exceptions ?? []) as BookingException[] };
}
