import type { SupabaseClient } from "@supabase/supabase-js";

/** A row of my_coverage(): a coverage request the caller sent or received. */
export type Coverage = {
  id: string;
  status: "open" | "accepted" | "declined" | "cancelled";
  incoming: boolean;
  booking_id: string;
  occurs_on: string;
  starts_at: string;
  duration_min: number | null;
  access_from: string;
  access_until: string;
  message: string | null;
  responded_at: string | null;
  created_at: string;
  from_walker_id: string;
  from_name: string;
  to_walker_id: string;
  to_name: string;
  client_id: string;
  client_name: string;
  dog_ids: string[];
  dog_names: string | null;
  cancelled_by: string | null;
};

export async function fetchMyCoverage(supabase: SupabaseClient): Promise<Coverage[]> {
  const { data } = await supabase.rpc("my_coverage");
  return ((data ?? []) as Coverage[]).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

export type DayCoverage =
  | { kind: "covered"; request: Coverage }
  | { kind: "requested"; requests: Coverage[] }
  | { kind: "needs" }
  | null;

/**
 * Coverage state of one occurrence, from the requests the regular walker sent:
 * accepted → covered; still open → requested; declined, or a cover that was
 * cancelled after it was accepted → needs coverage. A request the walker
 * withdrew before anyone answered doesn't count.
 */
export function dayCoverage(outgoing: Coverage[], bookingId: string, day: string): DayCoverage {
  const rs = outgoing.filter((r) => !r.incoming && r.booking_id === bookingId && r.occurs_on === day);
  const accepted = rs.find((r) => r.status === "accepted");
  if (accepted) return { kind: "covered", request: accepted };
  const open = rs.filter((r) => r.status === "open");
  if (open.length) return { kind: "requested", requests: open };
  const fellThrough = rs.some(
    (r) =>
      r.status === "declined" ||
      (r.status === "cancelled" && (r.responded_at !== null || r.cancelled_by === null || r.cancelled_by === r.to_walker_id)),
  );
  return fellThrough ? { kind: "needs" } : null;
}

export function inWindow(r: Coverage, now = Date.now()) {
  return now >= new Date(r.access_from).getTime() && now < new Date(r.access_until).getTime();
}
