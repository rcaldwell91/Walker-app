/** Light / dark. "system" follows the phone. Stored per device in a cookie so the first paint is right. */
export const THEME_COOKIE = "theme";
export type ThemeChoice = "system" | "light" | "dark";
export const THEME_CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "Match phone" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
export function isThemeChoice(v: string | undefined | null): v is ThemeChoice {
  return v === "system" || v === "light" || v === "dark";
}
