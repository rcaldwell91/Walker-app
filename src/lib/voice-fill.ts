import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { EVENT_LABELS } from "@/lib/events";
import { PET_SCORES } from "@/lib/pet-scores";

/**
 * "Talk it through": a walker's spoken rundown turned into a form (log taps,
 * ratings, "working on", a draft note for the owners). Used by the walk
 * wrap-up and the boarding daily update. Server only; ANTHROPIC_API_KEY never
 * reaches the browser. Nothing is saved here.
 */

export type VoiceFill = {
  pets: { id: string; counts: Record<string, number>; workingOn: string | null; scores: Record<string, number> }[];
  summary: string;
};
export type VoiceResult = { fill: VoiceFill } | { error: string; setup?: boolean };

export async function askForFill({
  what,
  pets,
  buttons,
  workingOn,
  transcript,
}: {
  /** "a walk" or "a day of a boarding stay" */
  what: string;
  pets: { id: string; name: string; working_on?: string | null }[];
  buttons: string[];
  /** Ask for each pet's "working on" (walks only). */
  workingOn: boolean;
  transcript: string;
}): Promise<VoiceResult> {
  const text = transcript.trim().slice(0, 6000);
  if (!text) return { error: "Say how it went first." };
  if (!process.env.ANTHROPIC_API_KEY) return { error: "Voice fill needs setup.", setup: true };
  if (!pets.length) return { error: "No pets here." };

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
    pets: pets.map((p) => (workingOn ? { pet_id: p.id, name: p.name, working_on_before: p.working_on || null } : { pet_id: p.id, name: p.name })),
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
        `You turn a dog walker's spoken rundown of ${what} into their report form. ` +
        "Only record what the walker actually said. Leave out a pet, button, rating or working_on that wasn't mentioned (empty list, or null for working_on). " +
        "Counts are how many times it happened (\"pooped twice\" is 2, \"fed breakfast and dinner\" is fed 2). " +
        "Ratings are 1 to 5 on the scale given for each category, only when the walker described it (\"low energy\" is energy 1 or 2, \"happy\" is mood 4 or 5). " +
        (workingOn
          ? "working_on is a short phrase for the training goal they worked on (\"loose leash\"), not a sentence. "
          : "Always set working_on to null. ") +
        "owner_summary is a warm, short note to the owners in the walker's voice, first person, two to four sentences, using the pets' names. Don't invent anything.",
      messages: [
        {
          role: "user",
          content: `Details:\n${JSON.stringify(context, null, 1)}\n\nWhat the walker said:\n"""${text}"""`,
        },
      ],
    });
    if (response.stop_reason === "refusal") return { error: "Couldn't read that one. Fill it in with the buttons." };
    const out = response.parsed_output;
    if (!out) return { error: "Couldn't make sense of that. Try again, or use the buttons." };

    const known = new Set<string>(petIds);
    const fill: VoiceFill = {
      pets: out.pets
        .filter((p) => known.has(p.pet_id))
        .map((p) => ({
          id: p.pet_id,
          counts: Object.fromEntries(p.logs.filter((l) => buttons.includes(l.button) && l.count > 0).map((l) => [l.button, Math.min(20, l.count)])),
          workingOn: workingOn && p.working_on?.trim() ? p.working_on.trim().slice(0, 200) : null,
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
