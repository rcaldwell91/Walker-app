import { addDays } from "./time";

/** Boarding answers on each pet (dogs.boarding). Add a line to add a question. */
export const PET_BOARDING_FIELDS = [
  { key: "feeding", label: "Feeding schedule and amounts", placeholder: "e.g. 1 cup kibble at 7am and 6pm", long: true },
  { key: "meds_times", label: "Medication and times", placeholder: "e.g. Apoquel with breakfast. Blank if none", long: true },
  { key: "sleeps", label: "Where they sleep", placeholder: "e.g. on the bed, dog bed in the bedroom" },
  { key: "crate", label: "Crate?", placeholder: "e.g. crated at night, never crated" },
  { key: "separation_anxiety", label: "Separation anxiety", placeholder: "e.g. none, mild whining for 10 minutes" },
  { key: "alone", label: "What they do when left alone", placeholder: "e.g. sleeps, chews shoes, barks", long: true },
] as const;
export type PetBoarding = Partial<Record<(typeof PET_BOARDING_FIELDS)[number]["key"], string>> & { vet_release?: boolean };

/** One-tap buttons on a daily update. */
export const STAY_BUTTONS = ["fed", "meds", "potty", "walk", "play"];

/** Nights in a stay: each walker-local date from drop-off up to (not including) pick-up. */
export function stayNights(startDay: string, endDay: string) {
  const out: string[] = [];
  for (let d = startDay; d < endDay; d = addDays(d, 1)) out.push(d);
  return out;
}

export function dayDiff(a: string, b: string) {
  return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
}

/** Pets booked on each night. */
export function occupancy(stays: { start_day: string; end_day: string; pets: number }[]) {
  const byNight = new Map<string, number>();
  for (const s of stays) for (const d of stayNights(s.start_day, s.end_day)) byNight.set(d, (byNight.get(d) ?? 0) + s.pets);
  return byNight;
}

/** Price for a stay at the walker's rates: first pet per night, each extra pet per night. */
export function stayPrice(nights: number, pets: number, nightCents: number, extraCents: number) {
  return pets ? nights * (nightCents + extraCents * (pets - 1)) : 0;
}
