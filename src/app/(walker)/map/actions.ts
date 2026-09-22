"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/session";

export type TrailState = { error?: string; savedId?: string } | undefined;

const trailSchema = z.object({
  name: z.string().trim().min(1, "Give the trail a name"),
  notes: z.string().optional(),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export async function createTrail(_: TrailState, form: FormData): Promise<TrailState> {
  const parsed = trailSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { supabase, user } = await requireRole("walker", "operator");
  const { data, error } = await supabase
    .from("trails")
    .insert({
      walker_id: user.id,
      name: parsed.data.name,
      notes: parsed.data.notes?.trim() || null,
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      good_for_rain: form.get("good_for_rain") === "on",
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Couldn't save the trail" };
  revalidatePath("/map");
  revalidatePath("/walk/new");
  return { savedId: data.id };
}
