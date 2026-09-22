/**
 * Calendar math in the walker's own time zone. The server runs in UTC, so
 * "today" and "every Tuesday at 9" have to be worked out in the zone the
 * browser reports (stored in the `tz` cookie, see TimeZoneSync).
 *
 * Dates are passed around as "YYYY-MM-DD" keys in that zone.
 */

export const TZ_COOKIE = "tz";
export const DEFAULT_TZ = "UTC";

export function isValidTimeZone(tz: string | undefined | null): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const partsFmt = new Map<string, Intl.DateTimeFormat>();
function fmtFor(tz: string) {
  let f = partsFmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFmt.set(tz, f);
  }
  return f;
}

/** Wall-clock parts of `date` in `tz`. */
export function zonedParts(date: Date, tz: string) {
  const p: Record<string, number> = {};
  for (const { type, value } of fmtFor(tz).formatToParts(date)) {
    if (type !== "literal") p[type] = Number(value);
  }
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second };
}

/** The instant when the wall clock in `tz` reads dateKey at hh:mm. */
export function zonedToUtc(dateKey: string, hh: number, mm: number, tz: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  // Offset of tz at a moment, in ms (wall clock minus UTC).
  const offsetAt = (t: number) => {
    const p = zonedParts(new Date(t), tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t;
  };
  let t = wall - offsetAt(wall);
  t = wall - offsetAt(t); // second pass settles DST transitions
  return new Date(t);
}

export function dateKey(date: Date, tz: string) {
  const p = zonedParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function timeOfDay(date: Date, tz: string) {
  const p = zonedParts(date, tz);
  return { hh: p.hour, mm: p.minute, hhmm: `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}` };
}

export function addDays(key: string, n: number) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** ISO weekday of a date key: 1 = Monday … 7 = Sunday. */
export function isoWeekday(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
}

export function mondayOf(key: string) {
  return addDays(key, 1 - isoWeekday(key));
}

export function isDateKey(s: string | undefined | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

/** "Mon, Sep 21" for a date key, independent of any time zone. */
export function fmtDateKey(key: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

export const WEEKDAYS = [
  { n: 1, short: "Mon" },
  { n: 2, short: "Tue" },
  { n: 3, short: "Wed" },
  { n: 4, short: "Thu" },
  { n: 5, short: "Fri" },
  { n: 6, short: "Sat" },
  { n: 7, short: "Sun" },
];
