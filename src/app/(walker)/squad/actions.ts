"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { friendly } from "@/lib/errors";
import { cleanHandle, HANDLE_RE } from "@/lib/input";

export type FoundWalker = { id: string; handle: string; full_name: string; business_name: string; avatar_url: string | null };
export type FindState = { error?: string; found?: FoundWalker; sent?: string } | undefined;

/** Exact handle only. There's no list of walkers to browse. */
export async function findWalker(_: FindState, form: FormData): Promise<FindState> {
  // "Jess Walks", "@jess-walks" or a pasted link (…/w/jess-walks) all work.
  const handle = cleanHandle(String(form.get("handle") ?? ""));
  if (!handle) return { error: "Type their handle, e.g. jess-walks" };
  if (!HANDLE_RE.test(handle)) return { error: "Handles are at least 3 letters or numbers, e.g. jess-walks" };
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
  if (error) return { error: friendly(error) };
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
