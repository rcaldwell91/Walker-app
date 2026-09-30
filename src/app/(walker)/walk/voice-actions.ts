"use server";

import { requireRole } from "@/lib/session";
import { askForFill, type VoiceResult } from "@/lib/voice-fill";

export type { VoiceFill, VoiceResult } from "@/lib/voice-fill";

/** "Talk it through" on the walk wrap-up. Nothing is saved here; the wrap-up fills in and the walker checks it. */
export async function interpretWrapUp(walkId: string, transcript: string): Promise<VoiceResult> {
  if (!transcript.trim()) return { error: "Say how the walk went first." };
  if (!process.env.ANTHROPIC_API_KEY) return { error: "Voice fill needs setup.", setup: true };

  const { supabase, user } = await requireRole("walker", "operator");
  const { data: walk } = await supabase
    .from("walks")
    .select("id, service:service_types(log_buttons), walk_dogs(dog:dogs(id, name, working_on))")
    .eq("id", walkId)
    .eq("walker_id", user.id)
    .maybeSingle();
  if (!walk) return { error: "That walk isn't yours." };
  const service = Array.isArray(walk.service) ? walk.service[0] : walk.service;
  const buttons = ((service?.log_buttons as string[]) ?? []).filter((b) => b !== "note");
  const pets = (walk.walk_dogs ?? []).map((wd) => (Array.isArray(wd.dog) ? wd.dog[0] : wd.dog)!).filter(Boolean);
  if (!pets.length) return { error: "No pets on this walk." };
  return askForFill({ what: "a walk", pets, buttons, workingOn: true, transcript });
}
