/** Park and trail attributes the walker sets. Keys are stored in trails.features. */
export const PARK_FEATURES = [
  { key: "shade", label: "Shade", icon: "🌳" },
  { key: "off_leash", label: "Off-leash", icon: "🐕" },
  { key: "paved", label: "Paved path", icon: "🛤️" },
  { key: "water", label: "Water", icon: "🚰" },
  { key: "parking", label: "Parking", icon: "🅿️" },
  { key: "bathroom", label: "Bathroom", icon: "🚻" },
  { key: "fenced", label: "Fenced", icon: "🚧" },
  { key: "rain", label: "Good in rain", icon: "☔" },
] as const;

export type ParkFeature = (typeof PARK_FEATURES)[number]["key"];
export const PARK_FEATURE_KEYS = new Set<string>(PARK_FEATURES.map((f) => f.key));
export type Park = { id: string; name: string; lat: number; lng: number; features: string[]; notes?: string | null; address?: string | null };
