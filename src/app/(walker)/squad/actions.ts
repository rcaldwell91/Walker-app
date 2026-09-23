"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";

export type FoundWalker = { id: string; handle: string; full_name: string; business_name: string; avatar_url: string | null };
export type FindState = { error?: string; found?: FoundWalker; sent?: string } | undefined;

/** Exact handle only. There's no list of walkers to browse. */
export async function findWalker(_: FindState, form: FormData): Promise<FindState> {
  const handle = String(form.get("handle") ?? "").trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9-]{3,30}$/.test(handle)) return { error: "Handles are 3–30 lowercase letters, numbers, or dashes" };
  const { supabase } = await requireRole("walker");
  const { data } = await supabase.rpc("find_walker_by_handle", { p_handle: handle });
  const found = (data as FoundWalker[] | null)?.[0];
  return found ? { found } : { error: `No walker with the handle @${handle}` };
}

export async function sendLinkRequest(walkerId: string): Promise<FindState> {
  const { supabase, user } = await requireRole("walker");
  const { data: links } = await supabase
    .from("squad_links")
    .select("id, requester_id, recipient_id, status")
    .or(`and(requester_id.eq.${user.id},recipient_id.eq.${walkerId}),and(requester_id.eq.${walkerId},recipient_id.eq.${user.id})`);
  const mine = links?.find((l) => l.requester_id === user.id);
  const theirs = links?.find((l) => l.requester_id === walkerId);
  if (mine?.status === "accepted" || theirs?.status === "accepted") return { error: "You're already in each other's squad" };
  if (theirs?.status === "pending") return { error: "They've already asked you. Accept it below." };
  if (mine?.status === "pending") return { error: "Request already sent" };

  const { error } = mine
    ? await supabase.from("squad_links").update({ status: "pending" }).eq("id", mine.id)
    : await supabase.from("squad_links").insert({ requester_id: user.id, recipient_id: walkerId });
  if (error) return { error: error.message };
  revalidatePath("/squad");
  return { sent: walkerId };
}

export async function respondToLink(linkId: string, accept: boolean) {
  const { supabase } = await requireRole("walker");
  await supabase.from("squad_links").update({ status: accept ? "accepted" : "declined" }).eq("id", linkId);
  revalidatePath("/squad");
}

/** Either side can remove a link (or cancel a request they sent). */
export async function removeLink(linkId: string) {
  const { supabase } = await requireRole("walker");
  await supabase.from("squad_links").update({ status: "removed" }).eq("id", linkId);
  revalidatePath("/squad");
}
