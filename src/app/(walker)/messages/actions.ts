"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";

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
  revalidatePath(`/messages/${clientId}`);
  return { sentAt: Date.now() };
}
