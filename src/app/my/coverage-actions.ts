"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";

/** Approve (or revoke) a squad member to cover this client's walks and enter their home. */
export async function setCoverageApproval(clientId: string, walkerId: string, approve: boolean) {
  const { supabase } = await requireRole("client");
  const now = new Date().toISOString();
  if (approve) {
    await supabase
      .from("coverage_approvals")
      .upsert({ client_id: clientId, coverage_walker_id: walkerId, approved_at: now, revoked_at: null }, { onConflict: "client_id,coverage_walker_id" });
  } else {
    // Revoking also cancels that walker's upcoming covers for you (database trigger).
    await supabase
      .from("coverage_approvals")
      .update({ revoked_at: now })
      .eq("client_id", clientId)
      .eq("coverage_walker_id", walkerId)
      .is("revoked_at", null);
  }
  await supabase
    .from("coverage_approval_asks")
    .update({ answered_at: now })
    .eq("client_id", clientId)
    .eq("coverage_walker_id", walkerId)
    .is("answered_at", null);
  revalidatePath("/my");
  revalidatePath("/my/more");
}

/** "Not now" on the walker's ask. */
export async function dismissApprovalAsk(clientId: string, walkerId: string) {
  const { supabase } = await requireRole("client");
  await supabase
    .from("coverage_approval_asks")
    .update({ answered_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .eq("coverage_walker_id", walkerId)
    .is("answered_at", null);
  revalidatePath("/my");
}
