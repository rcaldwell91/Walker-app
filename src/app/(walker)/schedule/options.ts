import type { SupabaseClient } from "@supabase/supabase-js";

/** Clients (with their active dogs) and services the booking form offers. */
export async function bookingOptions(supabase: SupabaseClient, walkerId: string) {
  const [{ data: clients }, { data: services }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, dogs(id, name, active)")
      .eq("walker_id", walkerId)
      .neq("status", "archived")
      .order("name"),
    supabase.from("service_types").select("id, name, default_duration_min, walker_id").order("sort_order"),
  ]);
  return {
    clients: (clients ?? []).map((c) => ({
      id: c.id as string,
      name: c.name as string,
      dogs: (c.dogs ?? []).filter((d) => d.active).map((d) => ({ id: d.id as string, name: d.name as string })),
    })),
    services: (services ?? [])
      .filter((s) => s.walker_id === walkerId || s.walker_id === null)
      .map((s) => ({ id: s.id as string, name: s.name as string, default_duration_min: s.default_duration_min as number })),
  };
}
