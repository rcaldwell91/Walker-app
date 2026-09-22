/**
 * Straight-line routing. Good enough until real road routing is wired up
 * (Mapbox or Google, see CLAUDE.md). Everything that orders stops or estimates
 * travel time goes through here so the swap happens in one file.
 */

export type LatLng = { lat: number; lng: number };

/** Assumed average driving speed between pickups. */
export const DRIVE_MPH = 25;
const METERS_PER_MILE = 1609.344;

export function hasCoords<T extends { lat?: number | null; lng?: number | null }>(p: T): p is T & LatLng {
  return typeof p.lat === "number" && typeof p.lng === "number";
}

/** Great-circle distance in meters. */
export function distanceM(a: LatLng, b: LatLng) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function miles(meters: number) {
  return meters / METERS_PER_MILE;
}

/** Minutes to drive `meters` at DRIVE_MPH, rounded up. Never less than 1. */
export function etaMinutes(meters: number) {
  return Math.max(1, Math.ceil((miles(meters) / DRIVE_MPH) * 60));
}

/** Total length of a GPS line in meters. */
export function pathDistanceM(points: LatLng[]) {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += distanceM(points[i - 1], points[i]);
  return d;
}

/**
 * Nearest-neighbor pickup order: from `start`, always go to the closest stop
 * not yet visited. Stops without coordinates keep their original order at the end.
 * With no start, the first located stop is the start.
 */
export function nearestNeighborOrder<T extends { lat?: number | null; lng?: number | null }>(
  start: LatLng | null,
  stops: T[],
): T[] {
  const located = stops.filter(hasCoords);
  const unlocated = stops.filter((s) => !hasCoords(s));
  const out: T[] = [];
  let here: LatLng | null = start;
  const left = [...located];
  while (left.length) {
    let best = 0;
    if (here) {
      let bestD = Infinity;
      left.forEach((s, i) => {
        const d = distanceM(here!, s);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
    }
    const [next] = left.splice(best, 1);
    out.push(next);
    here = next;
  }
  return [...out, ...unlocated];
}

/** Up to `n` items closest to `point`, nearest first. Items without coordinates are skipped. */
export function closest<T extends { lat?: number | null; lng?: number | null }>(point: LatLng, items: T[], n: number) {
  return items
    .filter(hasCoords)
    .map((item) => ({ item, d: distanceM(point, item) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n);
}
