import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { PageTitle } from "@/components/ui";
import { EndWalkForm } from "./end-walk-form";

export default async function EndWalkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireRole("walker", "operator");
  const { data: walk } = await supabase
    .from("walks")
    .select("id, status, walk_dogs(dog:dogs(id, name, working_on, progress_summary))")
    .eq("id", id)
    .maybeSingle();
  if (!walk) notFound();
  const dogs = (walk.walk_dogs ?? []).map((wd) => (Array.isArray(wd.dog) ? wd.dog[0] : wd.dog)!).filter(Boolean);
  return (
    <>
      <PageTitle sub="Update what each dog is working on so it's there next pickup. Talk it out if that's easier.">
        Wrap up
      </PageTitle>
      <EndWalkForm walkId={walk.id} dogs={dogs} />
    </>
  );
}
