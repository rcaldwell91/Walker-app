import type { SupabaseClient } from "@supabase/supabase-js";
import type { LatLng } from "./geo/distance";

/**
 * Every GPS point of a walk, oldest first. Paged, because the API caps a
 * single response at 1,000 rows and a long walk logs more than that.
 */
export async function fetchGpsLine(supabase: SupabaseClient, walkId: string): Promise<LatLng[]> {
  const page = 1000;
  const out: LatLng[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from("gps_points")
      .select("lat, lng")
      .eq("walk_id", walkId)
      .order("at")
      .range(from, from + page - 1);
    if (error || !data?.length) break;
    out.push(...data);
    if (data.length < page) break;
  }
  return out;
}
