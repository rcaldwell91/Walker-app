"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { friendly } from "@/lib/errors";

const METHODS = ["cash", "venmo", "zelle", "check", "other"];
const time = /^([01]\d|2[0-3]):[0-5]\d$/;

/** One business setting, saved as soon as it's changed. */
export async function saveSetting(field: string, value: unknown): Promise<{ error?: string }> {
  let update: Record<string, unknown>;
  switch (field) {
    case "boarding_dropoff_time":
    case "boarding_pickup_time":
      if (typeof value !== "string" || !time.test(value)) return { error: "Pick a time" };
      update = { [field]: value };
      break;
    case "boarding_early_pickup":
      if (value !== "booked" && value !== "actual") return { error: "Pick one" };
      update = { boarding_early_pickup: value };
      break;
    case "untagged_photos_to_all":
      update = { untagged_photos_to_all: value === true };
      break;
    case "payment_methods": {
      const list = Array.isArray(value) ? value.filter((m): m is string => typeof m === "string" && METHODS.includes(m)) : [];
      if (!list.length) return { error: "Keep at least one way to pay" };
      update = { payment_methods: list };
      break;
    }
    case "tip_presets": {
      const list = Array.isArray(value) ? value.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 500) : [];
      if (!list.length || list.length > 4) return { error: "Tip amounts are whole dollars, 1 to 500" };
      update = { tip_presets: [...new Set(list)].sort((a, b) => a - b) };
      break;
    }
    case "eta_mph": {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 5 || n > 70) return { error: "Between 5 and 70 mph" };
      update = { eta_mph: n };
      break;
    }
    default:
      return { error: "Unknown setting" };
  }
  const { supabase, user } = await requireRole("walker", "operator");
  const { error } = await supabase.from("walkers").update(update).eq("id", user.id);
  if (error) return { error: friendly(error, "Didn't save. Try again.") };
  revalidatePath("/settings");
  return {};
}
