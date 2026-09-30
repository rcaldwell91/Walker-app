import { requireRole } from "@/lib/session";
import { PageTitle } from "@/components/ui";
import { MapScreen } from "./map-screen";

/** Where a walker plans the day: clients, parks, and which pets go where. */
export default async function MapPage() {
  const { supabase, user } = await requireRole("walker", "operator");
  const [{ data: clients }, { data: parks }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, color, group_label, lat, lng, address_line, city, dogs(id, name, active)")
      .eq("walker_id", user.id) // not clients you're covering for someone else
      .neq("status", "archived")
      .order("name"),
    supabase.from("trails").select("id, name, lat, lng, notes, address, features, walker_id").order("name"),
  ]);

  return (
    <>
      <PageTitle sub="Plan the day: pick the pets going out, then a park.">Map</PageTitle>
      <MapScreen
        clients={(clients ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          group: c.group_label,
          lat: c.lat,
          lng: c.lng,
          address: [c.address_line, c.city].filter(Boolean).join(", "),
          pets: (c.dogs ?? []).filter((d) => d.active).map((d) => ({ id: d.id, name: d.name })),
        }))}
        parks={(parks ?? []).map((p) => ({ ...p, features: p.features ?? [], own: p.walker_id === user.id }))}
      />
    </>
  );
}
