/**
 * Address → coordinates. Server only.
 *
 * Uses Nominatim (OpenStreetMap), which is free and keyless but allows at most
 * one request per second and requires an identifying User-Agent. Requests are
 * queued in-process so this server never exceeds that. Swap the body of
 * `lookup` for Mapbox or Google when we have a key; callers don't change.
 *
 * GEOCODER_URL overrides the Nominatim base URL (self-hosted instance, or a
 * stand-in for tests).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LatLng } from "./distance";

const BASE_URL = process.env.GEOCODER_URL || "https://nominatim.openstreetmap.org";
const MIN_GAP_MS = 1100;

let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

/**
 * Runs `fn` after every earlier request, at least MIN_GAP_MS after the previous
 * one finished (measuring from the finish keeps arrivals at Nominatim spaced too).
 */
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await fn();
    } finally {
      lastRequestAt = Date.now();
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

async function lookup(query: string): Promise<LatLng | null> {
  const url = `${BASE_URL}/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": `WalkerApp/0.1 (+${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"})`,
      "Accept-Language": "en",
    },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as { lat?: string; lon?: string }[];
  const lat = Number(rows?.[0]?.lat);
  const lng = Number(rows?.[0]?.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/** Coordinates for a free-text address, or null if it can't be found (or the service is down). */
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const q = address.trim();
  if (!q) return null;
  try {
    return await throttled(() => lookup(q));
  } catch {
    return null;
  }
}

/**
 * Geocodes a client's address and stores lat/lng on their row (null when there's
 * no address or it can't be found). Returns false only when an address was given
 * but couldn't be placed on the map.
 */
export async function saveClientCoordinates(
  supabase: SupabaseClient,
  clientId: string,
  addressLine: string | null | undefined,
  city: string | null | undefined,
): Promise<boolean> {
  const address = [addressLine, city].map((s) => s?.trim()).filter(Boolean).join(", ");
  const coords = address ? await geocodeAddress(address) : null;
  await supabase
    .from("clients")
    .update({ lat: coords?.lat ?? null, lng: coords?.lng ?? null })
    .eq("id", clientId);
  return !address || !!coords;
}
