import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { Card } from "@/components/ui";
import { getTimeZone } from "@/lib/timezone";
import { loadWalkReport, WalkReportView } from "@/components/walk-report";
import { RateWalkForm, TipForm, TipThanks } from "../../relationship-forms";
import { Stars } from "@/components/score-input";

export default async function ClientWalkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireRole("client");
  const tz = await getTimeZone();
  const data = await loadWalkReport(supabase, id);
  if (!data) notFound();
  const { walk } = data;

  const [{ data: mine }, { data: myRating }, { data: myTip }] = await Promise.all([
    supabase.from("clients").select("walker_id, walker:walkers!clients_walker_id_fkey(business_name, tips_enabled, profile:profiles(full_name))"),
    // Clients can only ever read ratings they gave (target = walker); see RLS.
    supabase.from("ratings").select("score, comment").eq("walk_id", id).eq("target", "walker").maybeSingle(),
    supabase.from("tips").select("amount_cents").eq("walk_id", id).neq("status", "cancelled").maybeSingle(),
  ]);
  // Walked by their own walker, or by a squad member covering?
  const row = (mine ?? []).find((c) => c.walker_id === walk.walker_id);
  const walker = row && (Array.isArray(row.walker) ? row.walker[0] : row.walker);
  const walkerProfile = walker && (Array.isArray(walker.profile) ? walker.profile[0] : walker.profile);
  const covered = !row;
  const walkerName = walkerProfile?.full_name || walker?.business_name || "your walker";
  const done = walk.status === "done";

  return (
    <>
      <WalkReportView data={data} tz={tz} byLine={covered && data.walkedBy ? `Walked by ${data.walkedBy}, covering for your walker` : null} />
      {done && !covered ? (
        <>
          <h2 className="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-muted">Rate this walk</h2>
          <Card className="mb-4">
            {myRating ? (
              <p data-my-rating={myRating.score}>
                You rated it <Stars score={myRating.score} />
                {myRating.comment ? <span className="mt-1 block text-sm text-muted">“{myRating.comment}”</span> : null}
              </p>
            ) : (
              <RateWalkForm walkId={walk.id} walkerName={walkerName} />
            )}
          </Card>

          {walker?.tips_enabled || myTip ? (
            <>
              <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Leave a tip</h2>
              <Card>{myTip ? <TipThanks amount={myTip.amount_cents / 100} /> : <TipForm walkId={walk.id} />}</Card>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}
