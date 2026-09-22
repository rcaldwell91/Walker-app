/** Pass `tz` from server components (the server runs in UTC); client components can omit it. */
export function fmtTime(iso: string | Date | null | undefined, tz?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: tz });
}

export function fmtDate(iso: string | Date | null | undefined, tz?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", timeZone: tz });
}

export function fmtDuration(startIso: string | null, endIso: string | null) {
  if (!startIso || !endIso) return "";
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function cents(n: number) {
  return `$${(n / 100).toFixed(n % 100 === 0 ? 0 : 2)}`;
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}
