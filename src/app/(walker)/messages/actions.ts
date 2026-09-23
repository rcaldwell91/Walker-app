"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { clientProfileId, notify } from "@/lib/notify";

export type MessageState = { error?: string; sentAt?: number } | undefined;

export async function sendMessage(clientId: string, _: MessageState, form: FormData): Promise<MessageState> {
  const body = String(form.get("body") ?? "").trim();
  if (!body) return { error: "Say or type something first" };
  if (body.length > 2000) return { error: "That's a long one. Keep it under 2,000 characters." };
  const { supabase, user } = await requireRole("walker", "operator");
  const { error } = await supabase.from("messages").insert({
    walker_id: user.id,
    client_id: clientId,
    sender_id: user.id,
    kind: "custom",
    body,
  });
  if (error) return { error: error.message };
  const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  await notify([await clientProfileId(clientId)], {
    kind: "message",
    title: `Message from ${me?.full_name ?? "your walker"}`,
    body: body.slice(0, 140),
    url: "/my/messages",
  });
  revalidatePath(`/messages/${clientId}`);
  return { sentAt: Date.now() };
}
