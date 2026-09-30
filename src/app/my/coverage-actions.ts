"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { friendly } from "@/lib/errors";

/** Approve (or revoke) a squad member to cover this client's walks and enter their home. */
export async function setCoverageApproval(clientId: string, walkerId: string, approve: boolean): Promise<{ error?: string }> {
  const { supabase } = await requireRole("client");
  const now = new Date().toISOString();
  const { error } = approve
    ? await supabase
      .from("coverage_approvals")
      .upsert({ client_id: clientId, coverage_walker_id: walkerId, approved_at: now, revoked_at: null }, { onConflict: "client_id,coverage_walker_id" })
    : // Revoking also cancels that walker's upcoming covers for you (database trigger).
      await supabase
        .from("coverage_approvals")
        .update({ revoked_at: now })
        .eq("client_id", clientId)
        .eq("coverage_walker_id", walkerId)
        .is("revoked_at", null);
  if (error) return { error: friendly(error, "Didn't save. Try again.") };
  await supabase
    .from("coverage_approval_asks")
    .update({ answered_at: now })
    .eq("client_id", clientId)
    .eq("coverage_walker_id", walkerId)
    .is("answered_at", null);
  revalidatePath("/my");
  revalidatePath("/my/more");
  return {};
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
