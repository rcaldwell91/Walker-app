"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { friendly } from "@/lib/errors";
import { toNumber } from "@/lib/input";

export type RatesState = { error?: string; saved?: number } | undefined;

/** Walk and visit rates. Fields: svc_enabled[<id>], svc_rate[<id>] (dollars), svc_duration[<id>] (minutes). */
export async function saveRates(_: RatesState, form: FormData): Promise<RatesState> {
  const { supabase, user } = await requireRole("walker", "operator");
  const rows: { walker_id: string; service_type_id: string; rate_cents: number; duration_min: number | null; enabled: boolean }[] = [];
  const ids = new Set<string>();
  for (const k of form.keys()) {
    const m = k.match(/^svc_rate\[(.+)\]$/);
    if (m) ids.add(m[1]);
  }
  for (const id of ids) {
    const rateRaw = String(form.get(`svc_rate[${id}]`) ?? "").trim();
    const enabled = form.get(`svc_enabled[${id}]`) === "on";
    if (!rateRaw) {
      if (enabled) return { error: "Add a rate for each service you offer" };
      continue;
    }
    const rate = toNumber(rateRaw); // "$25", "27.50"
    if (rate == null || rate < 0 || rate > 10000) return { error: "Rates should be dollar amounts, like 25 or 27.50" };
    const durRaw = String(form.get(`svc_duration[${id}]`) ?? "").trim();
    const durNum = toNumber(durRaw); // "30", "30 min"
    if (durRaw && durNum == null) return { error: "Minutes: a number like 30" };
    const dur = durNum ? Math.round(durNum) : null;
    if (dur !== null && (dur < 5 || dur > 1440)) return { error: "Durations are 5 to 1,440 minutes" };
    rows.push({ walker_id: user.id, service_type_id: id, rate_cents: Math.round(rate * 100), duration_min: dur, enabled });
  }
  if (rows.length) {
    const { error } = await supabase.from("walker_services").upsert(rows, { onConflict: "walker_id,service_type_id" });
    if (error) return { error: friendly(error) };
  }
  revalidatePath("/money/rates");
  return { saved: Date.now() };
}
