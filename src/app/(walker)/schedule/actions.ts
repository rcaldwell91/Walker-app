"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { isValidTimeZone, isDateKey, mondayOf, zonedToUtc } from "@/lib/time";

export type ActionState = { error?: string } | undefined;

const bookingSchema = z.object({
  client_id: z.string().uuid("Pick a client"),
  service_type_id: z.string().uuid("Pick a service"),
  date: z.string().refine(isDateKey, "Pick a date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Pick a time"),
  duration_min: z.coerce.number().int().min(5, "At least 5 minutes").max(1440, "At most 24 hours"),
  repeat_until: z.string().optional(),
  tz: z.string().refine(isValidTimeZone, "Unknown time zone"),
});

/** Create (id = null) or update a booking. */
export async function saveBooking(id: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  const parsed = bookingSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const repeatWeekdays = Array.from(new Set(form.getAll("repeat_weekday").map(Number)))
    .filter((n) => n >= 1 && n <= 7)
    .sort();
  const dogIds = form.getAll("dog_id").map(String).filter(Boolean);
  const repeatUntil = repeatWeekdays.length && isDateKey(d.repeat_until) ? d.repeat_until : null;
  if (repeatUntil && repeatUntil < d.date) return { error: "Repeat-until has to be after the first day" };
  if (!dogIds.length) return { error: "Pick at least one dog" };

  const { supabase, user } = await requireRole("walker", "operator");

  // The client and dogs have to be this walker's.
  const { data: client } = await supabase
    .from("clients")
    .select("id, dogs(id)")
    .eq("id", d.client_id)
    .eq("walker_id", user.id)
    .maybeSingle();
  if (!client) return { error: "That client isn't on your list" };
  const ownDogs = new Set((client.dogs ?? []).map((x) => x.id));
  if (dogIds.some((x) => !ownDogs.has(x))) return { error: "Those dogs don't belong to that client" };

  const row = {
    walker_id: user.id,
    client_id: d.client_id,
    service_type_id: d.service_type_id,
    starts_at: zonedToUtc(d.date, Number(d.time.slice(0, 2)), Number(d.time.slice(3)), d.tz).toISOString(),
    duration_min: d.duration_min,
    repeat_weekdays: repeatWeekdays,
    repeat_until: repeatUntil,
  };

  let bookingId = id;
  if (id) {
    const { error } = await supabase.from("bookings").update(row).eq("id", id);
    if (error) return { error: error.message };
    const { error: delErr } = await supabase.from("booking_dogs").delete().eq("booking_id", id);
    if (delErr) return { error: delErr.message };
  } else {
    const { data, error } = await supabase.from("bookings").insert(row).select("id").single();
    if (error || !data) return { error: error?.message ?? "Couldn't save" };
    bookingId = data.id;
  }
  const { error: dogErr } = await supabase
    .from("booking_dogs")
    .insert(dogIds.map((dog_id) => ({ booking_id: bookingId!, dog_id })));
  if (dogErr) return { error: `Saved, but the dogs didn't attach: ${dogErr.message}` };

  revalidatePath("/schedule");
  revalidatePath("/home");
  redirect(`/schedule?week=${mondayOf(d.date)}`);
}

export async function setBookingCancelled(id: string, cancelled: boolean) {
  const { supabase } = await requireRole("walker", "operator");
  await supabase.from("bookings").update({ status: cancelled ? "cancelled" : "scheduled" }).eq("id", id);
  revalidatePath("/schedule");
  revalidatePath(`/schedule/${id}`);
  revalidatePath("/home");
}
