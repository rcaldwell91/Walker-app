import { requireRole } from "@/lib/session";
import { PageTitle } from "@/components/ui";
import { MapScreen } from "./map-screen";

export default async function MapPage() {
  const { supabase, user } = await requireRole("walker", "operator");
  const [{ data: clients }, { data: trails }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, color, group_label, lat, lng, address_line, city, dogs(name, active)")
      .eq("walker_id", user.id) // not clients you're covering for someone else
      .neq("status", "archived")
      .order("name"),
    supabase.from("trails").select("id, name, lat, lng, notes, color, good_for_rain").order("name"),
  ]);

  return (
    <>
      <PageTitle sub="Tap a pin for details. Tap anywhere else to add a trail.">Map</PageTitle>
      <MapScreen
        clients={(clients ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          group: c.group_label,
          lat: c.lat,
          lng: c.lng,
          address: [c.address_line, c.city].filter(Boolean).join(", "),
          dogs: (c.dogs ?? []).filter((d) => d.active).map((d) => d.name),
        }))}
        trails={trails ?? []}
      />
    </>
  );
}
