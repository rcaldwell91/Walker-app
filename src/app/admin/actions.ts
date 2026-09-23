"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";

// Column guards (guard_walker_update) only let the operator change these two.

export async function setBackgroundCheck(walkerId: string, verified: boolean) {
  const { supabase } = await requireRole("operator");
  await supabase
    .from("walkers")
    .update({ background_check_verified_at: verified ? new Date().toISOString() : null })
    .eq("id", walkerId);
  revalidatePath("/admin");
}

export async function setWalkerStatus(walkerId: string, status: "active" | "paused" | "suspended") {
  if (!["active", "paused", "suspended"].includes(status)) return;
  const { supabase } = await requireRole("operator");
  await supabase.from("walkers").update({ status }).eq("id", walkerId);
  revalidatePath("/admin");
}
