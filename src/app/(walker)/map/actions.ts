"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { geocodeAddress } from "@/lib/geo/geocode";
import { PARK_FEATURE_KEYS } from "@/lib/parks";

export type ParkState = { error?: string; savedId?: string } | undefined;

const parkSchema = z.object({
  name: z.string().trim().min(1, "Give the park a name").max(120),
  notes: z.string().max(2000).optional(),
  address: z.string().max(300).optional(),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

const featuresFrom = (form: FormData) => form.getAll("feature").map(String).filter((f) => PARK_FEATURE_KEYS.has(f));

/** A park or trail, from a tap on the map or an address search. */
export async function createPark(_: ParkState, form: FormData): Promise<ParkState> {
  const parsed = parkSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { supabase, user } = await requireRole("walker", "operator");
  const features = featuresFrom(form);
  const { data, error } = await supabase
    .from("trails")
    .insert({
      walker_id: user.id,
      name: parsed.data.name,
      notes: parsed.data.notes?.trim() || null,
      address: parsed.data.address?.trim() || null,
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      features,
      good_for_rain: features.includes("rain"),
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Couldn't save the park" };
  revalidatePath("/map");
  revalidatePath("/walk/new");
  return { savedId: data.id };
}

/** One tap on an attribute chip. */
export async function setParkFeatures(parkId: string, features: string[]) {
  const { supabase, user } = await requireRole("walker", "operator");
  const clean = features.filter((f) => PARK_FEATURE_KEYS.has(f));
  await supabase.from("trails").update({ features: clean, good_for_rain: clean.includes("rain") }).eq("id", parkId).eq("walker_id", user.id);
  revalidatePath("/map");
  revalidatePath("/walk/new");
}

export async function deletePark(parkId: string) {
  const { supabase, user } = await requireRole("walker", "operator");
  await supabase.from("trails").delete().eq("id", parkId).eq("walker_id", user.id);
  revalidatePath("/map");
}

/** Address → a spot on the map, to add a park there. */
export async function findAddress(query: string): Promise<{ lat: number; lng: number } | { error: string }> {
  await requireRole("walker", "operator");
  const q = query.trim().slice(0, 300);
  if (!q) return { error: "Type an address or a park name" };
  const at = await geocodeAddress(q);
  return at ?? { error: "Couldn't find that. Try adding the city." };
}
