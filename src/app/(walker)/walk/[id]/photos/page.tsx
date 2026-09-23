import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { PageTitle } from "@/components/ui";
import { PhotoUploader } from "@/components/photo-uploader";

export default async function WalkPhotosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireRole("walker", "operator");
  const { data: walk } = await supabase
    .from("walks")
    .select("id, walk_dogs(dog:dogs(id, name)), photos(id, storage_path, caption, dog_id)")
    .eq("id", id)
    .eq("walker_id", user.id) // someone else's walk with your dogs: see /report/[id]
    .maybeSingle();
  if (!walk) notFound();
  const dogs = (walk.walk_dogs ?? []).map((wd) => (Array.isArray(wd.dog) ? wd.dog[0] : wd.dog)!).filter(Boolean);

  const existing = await Promise.all(
    (walk.photos ?? []).map(async (p) => {
      const { data } = await supabase.storage.from("photos").createSignedUrl(p.storage_path, 3600);
      return { id: p.id, url: data?.signedUrl ?? "", caption: p.caption };
    }),
  );

  return (
    <>
      <PageTitle sub="Owners see these on the walk report.">Photos</PageTitle>
      <PhotoUploader walkId={walk.id} walkerId={user.id} dogs={dogs} existing={existing} />
    </>
  );
}
