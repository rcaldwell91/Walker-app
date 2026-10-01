import { requireRole } from "@/lib/session";
import { NavList, PageTitle } from "@/components/ui";
import { BackBar } from "@/components/back-bar";
import { RECORD_KINDS } from "@/lib/records";

/** Records the walker keeps (incident reports for now). New kinds come from src/lib/records.ts. */
export default async function RecordsPage() {
  const { supabase, user } = await requireRole("walker", "operator");
  const counts = await Promise.all(
    RECORD_KINDS.map((k) => supabase.from(k.table).select("id", { count: "exact", head: true }).eq("walker_id", user.id)),
  );
  return (
    <>
      <PageTitle sub="What you've written down, kept in one place.">Records</PageTitle>
      <NavList
        items={RECORD_KINDS.map((k, i) => {
          const n = counts[i].count ?? 0;
          return { href: k.href, label: k.label, sub: `${k.sub} · ${n ? `${n} on file` : "none yet"}` };
        })}
      />
      <BackBar href="/more" label="More" />
    </>
  );
}
