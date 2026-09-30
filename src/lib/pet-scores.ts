/**
 * Quick ratings per pet, 1–5, all optional. Add a category by adding a line
 * here: nothing else changes (the database stores the key).
 */
export const PET_SCORES = [
  { key: "energy", label: "Energy level", low: "Low", high: "High" },
  { key: "leash", label: "Behavior on leash", low: "Rough", high: "Great" },
  { key: "mood", label: "Mood", low: "Down", high: "Happy" },
  { key: "health", label: "Health & appetite", low: "Off", high: "Great" },
] as const;

export type PetScoreKey = (typeof PET_SCORES)[number]["key"];
export const PET_SCORE_LABEL: Record<string, string> = Object.fromEntries(PET_SCORES.map((s) => [s.key, s.label]));
