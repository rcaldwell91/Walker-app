/**
 * Drive and walk time for a walk. Drive = start → last pickup; walk = last
 * pickup → end. With no pickups tapped, it's all walk time.
 */
export function splitMinutes(startedAt: string | null, pickups: (string | null)[], endedAt: string) {
  if (!startedAt) return { driveMinutes: null, walkMinutes: null };
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  const times = pickups.filter((p): p is string => !!p).map((p) => new Date(p).getTime());
  const lastPickup = times.length ? Math.min(Math.max(...times), end) : null;
  const mins = (ms: number) => Math.max(0, Math.round(ms / 60000));
  return lastPickup === null
    ? { driveMinutes: 0, walkMinutes: mins(end - start) }
    : { driveMinutes: mins(lastPickup - start), walkMinutes: mins(end - lastPickup) };
}

export type HoursTotals = { walks: number; walkMinutes: number; driveMinutes: number };

export function totalMinutes(walks: { walk_minutes: number | null; drive_minutes: number | null }[]): HoursTotals {
  return walks.reduce<HoursTotals>(
    (t, w) => ({ walks: t.walks + 1, walkMinutes: t.walkMinutes + (w.walk_minutes ?? 0), driveMinutes: t.driveMinutes + (w.drive_minutes ?? 0) }),
    { walks: 0, walkMinutes: 0, driveMinutes: 0 },
  );
}

export function fmtHours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}
