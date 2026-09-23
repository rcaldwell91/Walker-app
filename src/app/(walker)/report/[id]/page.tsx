import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { getTimeZone } from "@/lib/timezone";
import { loadWalkReport, WalkReportView } from "@/components/walk-report";

/** Read-only report of a walk someone in your squad did with your dogs. */
export default async function CoveredWalkReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireRole("walker", "operator");
  const tz = await getTimeZone();
  const data = await loadWalkReport(supabase, id);
  if (!data) notFound();
  if (data.walk.walker_id === user.id) redirect(data.walk.status === "done" ? `/walk/${id}/done` : `/walk/${id}`);
  return <WalkReportView data={data} tz={tz} byLine={data.walkedBy ? `Covered by ${data.walkedBy}` : null} />;
}
