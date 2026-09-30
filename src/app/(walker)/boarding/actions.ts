"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { getTimeZone } from "@/lib/timezone";
import { addDays, dateKey, fmtDateKey, isDateKey, zonedToUtc } from "@/lib/time";
import { billNow } from "@/lib/billing";
import { clientProfileId, notify } from "@/lib/notify";
import { PET_BOARDING_FIELDS, STAY_BUTTONS, dayDiff, occupancy, stayPrice } from "@/lib/boarding";
import { PET_SCORES } from "@/lib/pet-scores";
import { askForFill, type VoiceResult } from "@/lib/voice-fill";
import { friendly } from "@/lib/errors";

export type BoardingState = { error?: string; saved?: number } | undefined;
export type BookState = { error?: string; warning?: string } | undefined;

function toCents(raw: FormDataEntryValue | null): number | null | "bad" {
  const s = String(raw ?? "").trim().replace(/^\$/, "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 100000) return "bad";
  return Math.round(n * 100);
}

/** How many pets the walker can board at once. */
export async function setCapacity(_: BoardingState, form: FormData): Promise<BoardingState> {
  const n = Number(String(form.get("capacity") ?? "").trim());
  if (!Number.isInteger(n) || n < 0 || n > 100) return { error: "Enter a number of pets, like 3" };
  const { supabase, user } = await requireRole("walker", "operator");
  const { error } = await supabase.from("walkers").update({ boarding_capacity: n }).eq("id", user.id);
  if (error) return { error: friendly(error) };
  revalidatePath("/boarding");
  return { saved: Date.now() };
}

/** Per night for the first pet, per night for each extra pet from the same client. */
export async function saveBoardingRates(_: BoardingState, form: FormData): Promise<BoardingState> {
  const night = toCents(form.get("night"));
  const extra = toCents(form.get("extra"));
  if (night === "bad" || extra === "bad") return { error: "Rates should be dollar amounts, like 50 or 42.50" };
  const { supabase, user } = await requireRole("walker", "operator");
  const { error } = await supabase
    .from("walkers")
    .update({ boarding_night_cents: night, boarding_extra_pet_cents: extra })
    .eq("id", user.id);
  if (error) return { error: friendly(error) };
  revalidatePath("/money/rates");
  revalidatePath("/boarding");
  return { saved: Date.now() };
}

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Book a stay. Over capacity or on days off, it comes back with a warning
 * first; "Book anyway" sends it again with force=1.
 */
export async function bookStay(_: BookState, form: FormData): Promise<BookState> {
  const clientId = String(form.get("client_id") ?? "");
  const petIds = form.getAll("pet").map(String).filter(Boolean);
  const startDay = String(form.get("start_day") ?? "");
  const endDay = String(form.get("end_day") ?? "");
  const startTime = String(form.get("start_time") ?? "");
  const endTime = String(form.get("end_time") ?? "");
  const notes = String(form.get("notes") ?? "").trim().slice(0, 1000) || null;
  const force = form.get("force") === "1";
  if (!clientId) return { error: "Pick the client" };
  if (!petIds.length) return { error: "Pick at least one pet" };
  if (!isDateKey(startDay) || !isDateKey(endDay)) return { error: "Pick the drop-off and pick-up days" };
  if (!timeRe.test(startTime) || !timeRe.test(endTime)) return { error: "Pick the drop-off and pick-up times" };
  const nights = dayDiff(startDay, endDay);
  if (nights < 1) return { error: "Pick-up is at least one night after drop-off" };
  if (nights > 365) return { error: "That's more than a year. Check the dates" };
  const priceIn = toCents(form.get("price"));
  if (priceIn === "bad") return { error: "The price should be a dollar amount, like 150" };

  const { supabase, user } = await requireRole("walker", "operator");
  const tz = await getTimeZone();
  const [{ data: me }, { data: client }, { data: pets }] = await Promise.all([
    supabase.from("walkers").select("boarding_capacity, boarding_night_cents, boarding_extra_pet_cents").eq("id", user.id).single(),
    supabase.from("clients").select("id, name").eq("id", clientId).eq("walker_id", user.id).maybeSingle(),
    supabase.from("dogs").select("id, name").eq("client_id", clientId).eq("walker_id", user.id).in("id", petIds),
  ]);
  if (!client) return { error: "That client isn't yours" };
  if (!pets?.length || pets.length !== petIds.length) return { error: "Pick pets that belong to this client" };

  if (!force) {
    const warnings: string[] = [];
    const [{ data: others }, { data: away }] = await Promise.all([
      supabase
        .from("boarding_stays")
        .select("start_day, end_day, stay_pets(count)")
        .eq("walker_id", user.id)
        .neq("status", "cancelled")
        .lt("start_day", endDay)
        .gt("end_day", startDay),
      supabase.from("walker_time_off").select("starts_on, ends_on").eq("walker_id", user.id).lte("starts_on", endDay).gte("ends_on", startDay),
    ]);
    const cap = me?.boarding_capacity ?? 0;
    const byNight = occupancy(
      (others ?? []).map((s) => ({ start_day: s.start_day, end_day: s.end_day, pets: (s.stay_pets as unknown as { count: number }[])?.[0]?.count ?? 0 })),
    );
    let worst: { day: string; n: number } | null = null;
    for (let d = startDay; d < endDay; d = addDays(d, 1)) {
      const n = (byNight.get(d) ?? 0) + pets.length;
      if (n > cap && (!worst || n > worst.n)) worst = { day: d, n };
    }
    if (worst) {
      warnings.push(
        cap
          ? `Over capacity: ${worst.n} pets on the night of ${fmtDateKey(worst.day)}, and you take ${cap}.`
          : "You haven't set how many pets you can take.",
      );
    }
    if (away?.length) warnings.push(`You're away ${fmtDateKey(away[0].starts_on)}${away[0].ends_on !== away[0].starts_on ? `–${fmtDateKey(away[0].ends_on)}` : ""}.`);
    if (warnings.length) return { warning: warnings[0] }; // the strongest one only
  }

  const nightCents = me?.boarding_night_cents ?? 0;
  const extraCents = me?.boarding_extra_pet_cents ?? 0;
  const price = priceIn ?? stayPrice(nights, pets.length, nightCents, extraCents);
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const tomorrow = addDays(dateKey(new Date(), tz), 1);
  const { data: stay, error } = await supabase
    .from("boarding_stays")
    .insert({
      walker_id: user.id,
      client_id: clientId,
      starts_at: zonedToUtc(startDay, sh, sm, tz).toISOString(),
      ends_at: zonedToUtc(endDay, eh, em, tz).toISOString(),
      start_day: startDay,
      end_day: endDay,
      nights,
      night_cents: nightCents,
      extra_pet_cents: extraCents,
      price_cents: price,
      notes,
      // Booked for today or tomorrow: this booking message is the reminder.
      reminded_start_at: startDay <= tomorrow ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error || !stay) return { error: error?.message ?? "Couldn't book it. Try again." };
  const { error: petErr } = await supabase.from("stay_pets").insert(pets.map((p) => ({ stay_id: stay.id, dog_id: p.id })));
  if (petErr) {
    await supabase.from("boarding_stays").delete().eq("id", stay.id);
    return { error: friendly(petErr) };
  }

  const names = pets.map((p) => p.name).join(" & ");
  await notify([await clientProfileId(clientId)], {
    kind: "boarding",
    title: `Boarding booked for ${names}`,
    body: `${fmtDateKey(startDay)} to ${fmtDateKey(endDay)}. Tap to check their boarding details.`,
    url: `/my/stays/${stay.id}`,
  });
  revalidatePath("/boarding");
  redirect(`/boarding/${stay.id}`);
}

export async function cancelStay(stayId: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireRole("walker", "operator");
  const { error } = await supabase.from("boarding_stays").update({ status: "cancelled" }).eq("id", stayId).eq("walker_id", user.id).eq("status", "booked");
  if (error) return { error: friendly(error, "Couldn't cancel it. Try again.") };
  revalidatePath("/boarding");
  redirect("/boarding");
}

/**
 * Boarding answers. Fields: b[<dogId>][<key>], b[<dogId>][vet_release]=on,
 * emergency_contact, boarding_bringing. The walker edits them on a stay; the
 * client fills them in on their intake (src/app/my/actions.ts).
 */
export async function saveStayIntake(stayId: string, _: BoardingState, form: FormData): Promise<BoardingState> {
  const { supabase, user } = await requireRole("walker", "operator");
  const { data: stay } = await supabase
    .from("boarding_stays")
    .select("id, client_id, stay_pets(dog_id)")
    .eq("id", stayId)
    .eq("walker_id", user.id)
    .maybeSingle();
  if (!stay) return { error: "That stay isn't yours" };
  for (const sp of stay.stay_pets ?? []) {
    const boarding: Record<string, string | boolean> = {};
    for (const f of PET_BOARDING_FIELDS) {
      const v = String(form.get(`b[${sp.dog_id}][${f.key}]`) ?? "").trim().slice(0, 1000);
      if (v) boarding[f.key] = v;
    }
    boarding.vet_release = form.get(`b[${sp.dog_id}][vet_release]`) === "on";
    const { error } = await supabase.from("dogs").update({ boarding }).eq("id", sp.dog_id).eq("walker_id", user.id);
    if (error) return { error: friendly(error) };
  }
  const { error } = await supabase
    .from("clients")
    .update({
      emergency_contact: String(form.get("emergency_contact") ?? "").trim().slice(0, 300) || null,
      boarding_bringing: String(form.get("boarding_bringing") ?? "").trim().slice(0, 1000) || null,
    })
    .eq("id", stay.client_id)
    .eq("walker_id", user.id);
  if (error) return { error: friendly(error) };
  revalidatePath(`/boarding/${stayId}`);
  return { saved: Date.now() };
}

const updateSchema = z.object({
  pets: z.array(
    z.object({
      id: z.string().uuid(),
      counts: z.record(z.string(), z.number().int().min(0).max(20)),
      scores: z.record(z.string(), z.number().int().min(1).max(5)),
    }),
  ),
  photos: z.array(z.object({ id: z.string().uuid(), petIds: z.array(z.string().uuid()) })),
  note: z.string().max(4000),
});
export type StayUpdatePayload = z.infer<typeof updateSchema>;

/** Post (or re-post) one day's update, all in one transaction (post_stay_update). */
export async function postStayUpdate(updateId: string, payload: StayUpdatePayload): Promise<{ error?: string }> {
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) return { error: "Something in the update didn't look right. Check it and try again." };
  const u = parsed.data;
  const { supabase, user } = await requireRole("walker", "operator");
  const { data: upd } = await supabase
    .from("stay_updates")
    .select("id, day, stay:boarding_stays(id, client_id, stay_pets(dog_id, dog:dogs(name))), photos(id)")
    .eq("id", updateId)
    .eq("walker_id", user.id)
    .maybeSingle();
  const stay = upd && (Array.isArray(upd.stay) ? upd.stay[0] : upd.stay);
  if (!upd || !stay) return { error: "That update isn't yours" };
  const onStay = new Set((stay.stay_pets ?? []).map((sp) => sp.dog_id));
  const buttons = new Set(STAY_BUTTONS);
  const scoreKeys = new Set(PET_SCORES.map((s) => s.key as string));
  const logs: { dog_id: string; kind: string; count: number }[] = [];
  const scores: { dog_id: string; category: string; score: number }[] = [];
  for (const p of u.pets) {
    if (!onStay.has(p.id)) continue;
    for (const [kind, n] of Object.entries(p.counts)) if (buttons.has(kind) && n > 0) logs.push({ dog_id: p.id, kind, count: n });
    for (const [category, score] of Object.entries(p.scores)) if (scoreKeys.has(category)) scores.push({ dog_id: p.id, category, score });
  }
  const own = new Set((upd.photos ?? []).map((p) => p.id));
  const tags = u.photos.filter((p) => own.has(p.id)).map((p) => ({ photo_id: p.id, dog_ids: p.petIds.filter((id) => onStay.has(id)) }));

  const { data: postedAt, error } = await supabase.rpc("post_stay_update", {
    p_update: updateId,
    p_logs: logs,
    p_scores: scores,
    p_tags: tags,
    p_note: u.note,
  });
  if (error) return { error: friendly(error, "Couldn't post the update. Try again.") };
  if (postedAt) {
    // First post of the day (an edit doesn't ping the owner again).
    const names = (stay.stay_pets ?? [])
      .map((sp) => (Array.isArray(sp.dog) ? sp.dog[0] : sp.dog)?.name)
      .filter(Boolean)
      .join(" & ");
    await notify([await clientProfileId(stay.client_id)], {
      kind: "boarding",
      title: `Daily update: ${names}`,
      body: u.note.trim().slice(0, 140) || `See how ${fmtDateKey(upd.day)} went.`,
      url: `/my/stays/${stay.id}`,
    });
  }
  revalidatePath(`/boarding/${stay.id}`);
  redirect(`/boarding/${stay.id}?posted=${upd.day}`);
}

/** "Talk it through" on a daily update. Nothing is saved here. */
export async function interpretStayUpdate(updateId: string, transcript: string): Promise<VoiceResult> {
  if (!transcript.trim()) return { error: "Say how the day went first." };
  if (!process.env.ANTHROPIC_API_KEY) return { error: "Voice fill needs setup.", setup: true };
  const { supabase, user } = await requireRole("walker", "operator");
  const { data: upd } = await supabase
    .from("stay_updates")
    .select("id, stay:boarding_stays(stay_pets(dog:dogs(id, name)))")
    .eq("id", updateId)
    .eq("walker_id", user.id)
    .maybeSingle();
  const stay = upd && (Array.isArray(upd.stay) ? upd.stay[0] : upd.stay);
  if (!stay) return { error: "That update isn't yours." };
  const pets = (stay.stay_pets ?? []).map((sp) => (Array.isArray(sp.dog) ? sp.dog[0] : sp.dog)!).filter(Boolean);
  return askForFill({ what: "a day of a boarding stay at the walker's home", pets, buttons: STAY_BUTTONS, workingOn: false, transcript });
}

/** Pick-up: the stay is done and goes on the client's bill (end_stay). */
export async function endStay(stayId: string) {
  const { supabase } = await requireRole("walker", "operator");
  const { error } = await supabase.rpc("end_stay", { p_stay: stayId });
  if (error) redirect(`/boarding/${stayId}/summary?error=${encodeURIComponent(friendly(error, "Couldn't do that. Try again."))}`);
  revalidatePath("/boarding");
  revalidatePath(`/boarding/${stayId}`);
  redirect(`/boarding/${stayId}/summary`);
}

/** Put everything unbilled for this stay's client on a draft invoice, ready to send. */
export async function billStay(stayId: string) {
  const { supabase, user } = await requireRole("walker", "operator");
  const { data: stay } = await supabase.from("boarding_stays").select("client_id, status").eq("id", stayId).eq("walker_id", user.id).maybeSingle();
  if (!stay) redirect("/boarding");
  if (stay.status !== "done") {
    const { error } = await supabase.rpc("end_stay", { p_stay: stayId });
    if (error) redirect(`/boarding/${stayId}/summary?error=${encodeURIComponent(friendly(error, "Couldn't do that. Try again."))}`);
  }
  // Already on an invoice? Go there.
  const { data: line } = await supabase.from("invoice_lines").select("invoice_id").eq("stay_id", stayId).not("invoice_id", "is", null).limit(1).maybeSingle();
  if (line?.invoice_id) redirect(`/money/invoices/${line.invoice_id}`);
  const id = await billNow(supabase, user.id, stay.client_id, await getTimeZone());
  revalidatePath("/money");
  redirect(id ? `/money/invoices/${id}` : `/boarding/${stayId}/summary?error=${encodeURIComponent("Nothing to bill yet.")}`);
}
