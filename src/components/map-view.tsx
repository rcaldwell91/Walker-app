"use client";

/**
 * The one place that knows which map library we use (Leaflet + OpenStreetMap
 * tiles today). Pages pass plain pins and lines; swapping in Mapbox or Google
 * means rewriting this file only.
 *
 * NEXT_PUBLIC_MAP_TILE_URL overrides the tile server.
 */

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import type { LatLng } from "@/lib/geo/distance";

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  /** client: colored dot · trail: diamond · stop: numbered dot · me: where the walker is */
  kind: "client" | "trail" | "stop" | "me";
  color?: string | null;
  label?: string;
};

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const DEFAULT_CENTER: [number, number] = [39.5, -98.35]; // continental US
const ME_COLOR = "#2b6cb0";
const LINE_COLOR = "#2f7d5b";

export function MapView({
  pins = [],
  line = [],
  onPinClick,
  onMapClick,
  follow = false,
  className = "h-72",
}: {
  pins?: MapPin[];
  line?: LatLng[];
  onPinClick?: (id: string) => void;
  onMapClick?: (at: LatLng) => void;
  /** Keep the end of the line in view as it grows (live walks). */
  follow?: boolean;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const pinLayer = useRef<Leaflet.LayerGroup | null>(null);
  const lineLayer = useRef<Leaflet.Polyline | null>(null);
  const fittedFor = useRef<string | null>(null);
  const onPin = useRef(onPinClick);
  const onMap = useRef(onMapClick);
  const [ready, setReady] = useState(false);
  onPin.current = onPinClick;
  onMap.current = onMapClick;

  // Leaflet touches `window`, so load it in the browser only.
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((mod) => {
      if (cancelled || !el.current) return;
      const lf = (mod as unknown as { default?: typeof Leaflet }).default ?? (mod as typeof Leaflet);
      L.current = lf;
      const m = lf.map(el.current, { zoomControl: true, attributionControl: true }).setView(DEFAULT_CENTER, 4);
      lf.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
      pinLayer.current = lf.layerGroup().addTo(m);
      lineLayer.current = lf.polyline([], { color: LINE_COLOR, weight: 5, opacity: 0.85 }).addTo(m);
      m.on("click", (e: Leaflet.LeafletMouseEvent) => onMap.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
      map.current = m;
      setReady(true);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Pins
  useEffect(() => {
    const lf = L.current;
    if (!ready || !lf || !pinLayer.current) return;
    pinLayer.current.clearLayers();
    for (const p of pins) {
      const cls = `map-pin map-pin-${p.kind} pin-${p.id}`;
      const color = p.color || (p.kind === "me" ? ME_COLOR : p.kind === "trail" ? "#5b4636" : "#6b6960");
      let layer: Leaflet.Layer;
      if (p.kind === "client" || p.kind === "me") {
        layer = lf.circleMarker([p.lat, p.lng], {
          radius: p.kind === "me" ? 7 : 10,
          color: "#fff",
          weight: 2,
          fillColor: color,
          fillOpacity: 1,
          className: cls,
          bubblingMouseEvents: false,
        });
      } else {
        const inner =
          p.kind === "trail"
            ? `<span style="display:block;width:16px;height:16px;margin:3px;transform:rotate(45deg);background:${color};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.4)"></span>`
            : `<span style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:9999px;background:${color};border:2px solid #fff;color:#fff;font:600 12px/1 system-ui;box-shadow:0 0 0 1px rgba(0,0,0,.3)">${escapeHtml(p.label ?? "")}</span>`;
        layer = lf.marker([p.lat, p.lng], {
          icon: lf.divIcon({ html: inner, className: cls, iconSize: [24, 24], iconAnchor: [12, 12] }),
          keyboard: true,
          title: p.label,
        });
      }
      if (p.label && p.kind !== "stop") (layer as Leaflet.Path | Leaflet.Marker).bindTooltip(p.label);
      layer.on("click", () => onPin.current?.(p.id));
      layer.addTo(pinLayer.current);
    }
  }, [ready, pins]);

  // Line
  useEffect(() => {
    if (!ready || !lineLayer.current || !map.current) return;
    lineLayer.current.setLatLngs(line.map((p) => [p.lat, p.lng] as [number, number]));
    if (follow && line.length && fittedFor.current !== null) {
      const last = line[line.length - 1];
      if (!map.current.getBounds().pad(-0.2).contains([last.lat, last.lng])) map.current.panTo([last.lat, last.lng]);
    }
  }, [ready, line, follow]);

  // Fit everything in view once, and again whenever the set of pins changes (e.g. a filter).
  useEffect(() => {
    const lf = L.current;
    if (!ready || !lf || !map.current) return;
    const key = pins.map((p) => p.id).join(",") + (line.length ? "|line" : "");
    if (fittedFor.current === key) return;
    const pts: [number, number][] = [...pins.map((p) => [p.lat, p.lng] as [number, number]), ...line.map((p) => [p.lat, p.lng] as [number, number])];
    if (!pts.length) return;
    fittedFor.current = key;
    if (pts.length === 1) map.current.setView(pts[0], 15);
    else map.current.fitBounds(lf.latLngBounds(pts), { padding: [30, 30], maxZoom: 16 });
  }, [ready, pins, line]);

  // `isolate` keeps Leaflet's high z-index panes under the bottom nav.
  return <div ref={el} className={`isolate w-full overflow-hidden rounded-2xl border border-border ${className}`} />;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
