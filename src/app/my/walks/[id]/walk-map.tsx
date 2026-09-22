"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MapView, type MapPin } from "@/components/map-view";
import { createClient } from "@/lib/supabase/client";
import type { LatLng } from "@/lib/geo/distance";

/**
 * The walk's GPS line. While the walk is in progress it listens for new GPS
 * points and tap events (Supabase Realtime) and redraws / refreshes as they land.
 */
export function WalkMap({ walkId, initialLine, live }: { walkId: string; initialLine: LatLng[]; live: boolean }) {
  const router = useRouter();
  const [line, setLine] = useState(initialLine);
  const [connected, setConnected] = useState(false);

  // A refresh brings the server's copy of the line; keep whichever is longer.
  useEffect(() => {
    setLine((l) => (initialLine.length > l.length ? initialLine : l));
  }, [initialLine]);

  useEffect(() => {
    if (!live) return;
    const supabase = createClient();
    let refresh: ReturnType<typeof setTimeout> | null = null;
    const refreshSoon = () => {
      if (refresh) clearTimeout(refresh);
      refresh = setTimeout(() => router.refresh(), 800);
    };
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
      channel = supabase
        .channel(`walk:${walkId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "gps_points", filter: `walk_id=eq.${walkId}` },
          (payload) => {
            const p = payload.new as { lat: number; lng: number; at: string };
            setLine((l) => [...l, { lat: p.lat, lng: p.lng }]);
          },
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "walk_events", filter: `walk_id=eq.${walkId}` },
          refreshSoon,
        )
        .subscribe((status) => setConnected(status === "SUBSCRIBED"));
    })();

    // Catches what isn't broadcast (the walk ending, notes, drop-offs).
    const poll = setInterval(() => router.refresh(), 60000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      if (refresh) clearTimeout(refresh);
      if (channel) supabase.removeChannel(channel);
    };
  }, [walkId, live, router]);

  const last = line.at(-1);
  const pins: MapPin[] = live && last ? [{ id: "walker", lat: last.lat, lng: last.lng, kind: "me", label: "Your walker" }] : [];

  if (!line.length) {
    return (
      <div className="mb-4 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
        {live ? "Waiting for the first GPS point…" : "No GPS trail for this walk."}
      </div>
    );
  }
  return (
    <div className="mb-4">
      <MapView line={line} pins={pins} follow={live} className="h-64" />
      {live ? (
        <p className="mt-1 text-xs text-muted" data-live={connected ? "on" : "off"}>
          {connected ? "Live · updates as they walk" : "Connecting…"}
        </p>
      ) : null}
    </div>
  );
}
