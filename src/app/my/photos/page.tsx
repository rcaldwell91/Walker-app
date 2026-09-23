import Link from "next/link";
import { requireRole } from "@/lib/session";
import { Empty, PageTitle } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { getTimeZone } from "@/lib/timezone";

export default async function MyPhotosPage() {
  const { supabase } = await requireRole("client");
  const tz = await getTimeZone();
  // RLS returns photos of this owner's dogs and whole-group photos from their walks.
  const { data: photos } = await supabase
    .from("photos")
    .select("id, storage_path, caption, taken_at, created_at, walk_id, dog:dogs(name)")
    .order("created_at", { ascending: false })
    .limit(300);

  const paths = (photos ?? []).map((p) => p.storage_path);
  const signed: { path: string | null; signedUrl: string | null }[] = paths.length
    ? ((await supabase.storage.from("photos").createSignedUrls(paths, 3600)).data ?? [])
    : [];
  const urlFor = new Map<string | null, string | null>(signed.map((s) => [s.path, s.signedUrl]));

  return (
    <>
      <PageTitle sub="From your walker, newest first.">Photos</PageTitle>
      {!photos?.length ? (
        <Empty>Photos from walks will show up here.</Empty>
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {photos.map((p) => {
            const url = urlFor.get(p.storage_path);
            const dog = Array.isArray(p.dog) ? p.dog[0] : p.dog;
            return (
              <li key={p.id} className="overflow-hidden rounded-xl bg-border">
                <Link href={p.walk_id ? `/my/walks/${p.walk_id}` : "#"}>
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={p.caption ?? dog?.name ?? "Walk photo"} className="aspect-square w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="aspect-square" />
                  )}
                  <p className="truncate bg-card px-2 py-1 text-xs text-muted">
                    {dog?.name ? `${dog.name} · ` : ""}
                    {fmtDate(p.taken_at ?? p.created_at, tz)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
