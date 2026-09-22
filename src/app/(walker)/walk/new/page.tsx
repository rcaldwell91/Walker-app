import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { Empty, PageTitle } from "@/components/ui";
import { StartWalkForm } from "./start-walk-form";

export default async function NewWalkPage() {
  const { supabase, user } = await requireRole("walker", "operator");

  const { data: active } = await supabase.from("walks").select("id").eq("status", "in_progress").maybeSingle();
  if (active) redirect(`/walk/${active.id}`);

  const [{ data: clients }, { data: services }, { data: trails }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, color, group_label, dogs(id, name, working_on, active)")
      .eq("status", "active")
      .order("name"),
    supabase.from("service_types").select("id, name, category, walker_id").order("sort_order"),
    supabase.from("trails").select("id, name, walker_id").order("name"),
  ]);

  const dogs = (clients ?? []).flatMap((c) =>
    (c.dogs ?? [])
      .filter((d) => d.active)
      .map((d) => ({ ...d, clientName: c.name, color: c.color, group: c.group_label })),
  );

  if (!dogs.length) {
    return (
      <>
        <PageTitle>Start a walk</PageTitle>
        <Empty>Once a client joins and their dogs are on file, you can start walks here.</Empty>
      </>
    );
  }

  // Walker's own service types win over platform defaults with the same key.
  const svc = (services ?? []).filter((s) => s.walker_id === user.id || s.walker_id === null);

  return (
    <>
      <PageTitle sub="Tap the dogs you're picking up.">Start a walk</PageTitle>
      <StartWalkForm dogs={dogs} services={svc} trails={trails ?? []} />
    </>
  );
}
