import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { PageTitle } from "@/components/ui";
import { IncidentForm } from "@/components/incident-form";

export default async function WalkIncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireRole("walker", "operator");
  const { data: walk } = await supabase
    .from("walks")
    .select("id, walk_dogs(dog:dogs(id, name))")
    .eq("id", id)
    .maybeSingle();
  if (!walk) notFound();
  const dogs = (walk.walk_dogs ?? []).map((wd) => (Array.isArray(wd.dog) ? wd.dog[0] : wd.dog)!).filter(Boolean);
  return (
    <>
      <PageTitle sub="Quick and factual. You can add more later.">Incident report</PageTitle>
      <IncidentForm walkId={walk.id} dogs={dogs} />
    </>
  );
}
