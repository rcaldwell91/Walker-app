"use server";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { requireRole } from "@/lib/session";
import { EVENT_LABELS } from "@/lib/events";
import { PET_SCORES } from "@/lib/pet-scores";

/**
 * "Talk it through": the walker's spoken rundown of the walk, turned into the
 * wrap-up (log taps, "working on", ratings, a draft summary for the owners).
 * Runs on the server only; ANTHROPIC_API_KEY never reaches the browser.
 * Nothing is saved here. The wrap-up fills in and the walker checks it.
 */

export type VoiceFill = {
  pets: { id: string; counts: Record<string, number>; workingOn: string | null; scores: Record<string, number> }[];
  summary: string;
};
export type VoiceResult = { fill: VoiceFill } | { error: string; setup?: boolean };

export async function interpretWrapUp(walkId: string, transcript: string): Promise<VoiceResult> {
  const text = transcript.trim().slice(0, 6000);
  if (!text) return { error: "Say how the walk went first." };
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

  const petIds = pets.map((p) => p.id) as [string, ...string[]];
  const scoreKeys = PET_SCORES.map((s) => s.key) as unknown as [string, ...string[]];
  const schema = z.object({
    pets: z.array(
      z.object({
        pet_id: z.enum(petIds),
        logs: z.array(z.object({ button: buttons.length ? z.enum(buttons as [string, ...string[]]) : z.string(), count: z.number().int() })),
        working_on: z.string().nullable(),
        ratings: z.array(z.object({ category: z.enum(scoreKeys), score: z.number().int() })),
      }),
    ),
    owner_summary: z.string(),
  });

  const context = {
    pets: pets.map((p) => ({ pet_id: p.id, name: p.name, working_on_before: p.working_on || null })),
    log_buttons: buttons.map((b) => ({ button: b, label: EVENT_LABELS[b] ?? b })),
    rating_categories: PET_SCORES.map((s) => ({ category: s.key, label: s.label, "1": s.low, "5": s.high })),
  };

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(schema) },
      system:
        "You turn a dog walker's spoken rundown of a walk into their wrap-up form. " +
        "Only record what the walker actually said. Leave out a pet, button, rating or working_on that wasn't mentioned (empty list, or null for working_on). " +
        "Counts are how many times it happened (\"pooped twice\" is 2). " +
        "Ratings are 1 to 5 on the scale given for each category, only when the walker described it (\"low energy\" is energy 1 or 2, \"happy\" is mood 4 or 5). " +
        "working_on is a short phrase for the training goal they worked on (\"loose leash\"), not a sentence. " +
        "owner_summary is a warm, short note to the owners in the walker's voice, first person, two to four sentences, using the pets' names. Don't invent anything.",
      messages: [
        {
          role: "user",
          content: `Walk details:\n${JSON.stringify(context, null, 1)}\n\nWhat the walker said:\n"""${text}"""`,
        },
      ],
    });
    if (response.stop_reason === "refusal") return { error: "Couldn't read that one. Fill it in with the buttons." };
    const out = response.parsed_output;
    if (!out) return { error: "Couldn't make sense of that. Try again, or use the buttons." };

    const known = new Set(petIds);
    const fill: VoiceFill = {
      pets: out.pets
        .filter((p) => known.has(p.pet_id))
        .map((p) => ({
          id: p.pet_id,
          counts: Object.fromEntries(p.logs.filter((l) => buttons.includes(l.button) && l.count > 0).map((l) => [l.button, Math.min(20, l.count)])),
          workingOn: p.working_on?.trim() ? p.working_on.trim().slice(0, 200) : null,
          scores: Object.fromEntries(p.ratings.filter((r) => r.score >= 1 && r.score <= 5).map((r) => [r.category, r.score])),
        })),
      summary: out.owner_summary.trim().slice(0, 2000),
    };
    return { fill };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { error: "Voice fill needs setup: the API key was rejected.", setup: true };
    if (e instanceof Anthropic.RateLimitError) return { error: "Voice fill is busy. Try again in a minute, or use the buttons." };
    if (e instanceof Anthropic.APIConnectionError) return { error: "No connection for voice fill right now. The buttons still work." };
    if (e instanceof Anthropic.APIError) return { error: "Voice fill didn't work this time. The buttons still work." };
    return { error: "Couldn't make sense of that. Try again, or use the buttons." };
  }
}
