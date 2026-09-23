import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { Empty, PageTitle } from "@/components/ui";
import { StartWalkForm } from "./start-walk-form";

export default async function NewWalkPage({ searchParams }: { searchParams: Promise<{ dogs?: string }> }) {
  const { dogs: preselect } = await searchParams;
  const { supabase, user } = await requireRole("walker", "operator");

  const { data: active } = await supabase.from("walks").select("id").eq("walker_id", user.id).eq("status", "in_progress").maybeSingle();
  if (active) redirect(`/walk/${active.id}`);

  const [{ data: clients }, { data: services }, { data: trails }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, color, group_label, lat, lng, walker_id, dogs(id, name, working_on, active)")
      // Invited clients count too: a walker can walk a dog before the owner makes a login.
      // Clients you're covering today show up here too (RLS, only inside the cover window).
      .in("status", ["active", "invited"])
      .order("name"),
    supabase.from("service_types").select("id, name, category, walker_id").order("sort_order"),
    supabase.from("trails").select("id, name, walker_id, lat, lng").order("name"),
  ]);

  const dogs = (clients ?? []).flatMap((c) =>
    (c.dogs ?? [])
      .filter((d) => d.active)
      .map((d) => ({ ...d, clientId: c.id, clientName: c.name, color: c.color, group: c.group_label, covering: c.walker_id !== user.id })),
  );
  const stops = (clients ?? []).map((c) => ({ id: c.id, name: c.name, color: c.color, lat: c.lat, lng: c.lng }));

  if (!dogs.length) {
    return (
      <>
        <PageTitle>Start a walk</PageTitle>
        <Empty>Once a client&apos;s dogs are on file, you can start walks here.</Empty>
      </>
    );
  }

  // Walker's own service types win over platform defaults with the same key.
  const svc = (services ?? []).filter((s) => s.walker_id === user.id || s.walker_id === null);

  return (
    <>
      <PageTitle sub="Tap the dogs you're picking up.">Start a walk</PageTitle>
      <StartWalkForm
        initialSelected={(preselect ?? "").split(",").filter((id) => dogs.some((d) => d.id === id))}
        dogs={dogs}
        stops={stops}
        services={svc}
        trails={trails ?? []}
        ownTrailIds={(trails ?? []).filter((t) => t.walker_id === user.id).map((t) => t.id)}
      />
    </>
  );
}
