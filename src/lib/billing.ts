/**
 * Walkers billing their own clients. Finished walks arrive as unbilled lines
 * (database trigger); here they're gathered into draft invoices per the
 * client's schedule, on page load (no cron). The walker reviews and sends.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, dateKey, mondayOf } from "./time";

export type Schedule = "per_walk" | "weekly" | "monthly";

export const SCHEDULE_LABEL: Record<Schedule, string> = {
  per_walk: "After every walk",
  weekly: "Weekly (Mon–Sun)",
  monthly: "Monthly",
};

export const METHOD_LABEL = { cash: "Cash", venmo: "Venmo", zelle: "Zelle", check: "Check", other: "Other" } as const;
export type Method = keyof typeof METHOD_LABEL;

/** The billing period a day falls in. */
export function periodFor(schedule: Schedule, day: string): { start: string; end: string } {
  if (schedule === "per_walk") return { start: day, end: day };
  if (schedule === "weekly") {
    const start = mondayOf(day);
    return { start, end: addDays(start, 6) };
  }
  const start = `${day.slice(0, 7)}-01`;
  const [y, m] = day.split("-").map(Number);
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start, end };
}

type Line = { id: string; client_id: string; occurred_on: string };

async function createDraft(supabase: SupabaseClient, walkerId: string, clientId: string, start: string, end: string, lineIds: string[]) {
  const { data: inv, error } = await supabase
    .from("invoices")
    .insert({ walker_id: walkerId, client_id: clientId, period_start: start, period_end: end, number: 0 })
    .select("id")
    .single();
  if (error || !inv) return null;
  await supabase.from("invoice_lines").update({ invoice_id: inv.id }).in("id", lineIds).is("invoice_id", null);
  return inv.id as string;
}

/**
 * Draft invoices for every finished period that has unbilled lines.
 * Per-walk clients get one invoice per walk day as soon as it's done.
 * Returns how many drafts were created.
 */
export async function draftDueInvoices(supabase: SupabaseClient, walkerId: string, tz: string, onlyClientId?: string) {
  const today = dateKey(new Date(), tz);
  let q = supabase.from("clients").select("id, billing_schedule").eq("walker_id", walkerId);
  if (onlyClientId) q = q.eq("id", onlyClientId);
  const [{ data: clients }, { data: lines }] = await Promise.all([
    q,
    supabase.from("invoice_lines").select("id, client_id, occurred_on").eq("walker_id", walkerId).is("invoice_id", null),
  ]);
  const schedule = new Map((clients ?? []).map((c) => [c.id, c.billing_schedule as Schedule]));
  const groups = new Map<string, { clientId: string; start: string; end: string; ids: string[] }>();
  for (const l of (lines ?? []) as Line[]) {
    const s = schedule.get(l.client_id);
    if (!s) continue;
    const p = periodFor(s, l.occurred_on);
    const finished = s === "per_walk" ? p.end <= today : p.end < today;
    if (!finished) continue;
    const key = `${l.client_id}|${p.start}`;
    const g = groups.get(key) ?? { clientId: l.client_id, start: p.start, end: p.end, ids: [] };
    g.ids.push(l.id);
    groups.set(key, g);
  }
  let created = 0;
  for (const g of groups.values()) {
    if (await createDraft(supabase, walkerId, g.clientId, g.start, g.end, g.ids)) created++;
  }
  return created;
}

/** "Bill now": everything unbilled for this client up to today, in one draft. */
export async function billNow(supabase: SupabaseClient, walkerId: string, clientId: string, tz: string) {
  const today = dateKey(new Date(), tz);
  const { data: lines } = await supabase
    .from("invoice_lines")
    .select("id, occurred_on")
    .eq("walker_id", walkerId)
    .eq("client_id", clientId)
    .is("invoice_id", null)
    .lte("occurred_on", today)
    .order("occurred_on");
  if (!lines?.length) return null;
  return createDraft(supabase, walkerId, clientId, lines[0].occurred_on, today, lines.map((l) => l.id));
}

export type InvoiceSummary = {
  id: string;
  number: number;
  status: "draft" | "sent" | "void";
  client_id: string;
  period_start: string;
  period_end: string;
  issued_on: string | null;
  due_on: string | null;
  total: number;
  paid: number;
  balance: number;
  overdue: boolean;
};

/** Totals for invoices with their lines and payments embedded. */
export function summarize(
  invoices: {
    id: string;
    number: number;
    status: string;
    client_id: string;
    period_start: string;
    period_end: string;
    issued_on: string | null;
    due_on: string | null;
    invoice_lines?: { amount_cents: number }[] | null;
    payments?: { amount_cents: number }[] | null;
  }[],
  today: string,
): InvoiceSummary[] {
  return invoices.map((i) => {
    const total = (i.invoice_lines ?? []).reduce((n, l) => n + l.amount_cents, 0);
    const paid = (i.payments ?? []).reduce((n, p) => n + p.amount_cents, 0);
    const balance = i.status === "void" ? 0 : Math.max(0, total - paid);
    return {
      id: i.id,
      number: i.number,
      status: i.status as InvoiceSummary["status"],
      client_id: i.client_id,
      period_start: i.period_start,
      period_end: i.period_end,
      issued_on: i.issued_on,
      due_on: i.due_on,
      total,
      paid,
      balance,
      overdue: i.status === "sent" && balance > 0 && !!i.due_on && i.due_on < today,
    };
  });
}

export const INVOICE_FIELDS =
  "id, number, status, client_id, period_start, period_end, issued_on, due_on, sent_at, invoice_lines(amount_cents), payments(amount_cents)";

export function statusLabel(s: InvoiceSummary) {
  if (s.status === "draft") return "Draft";
  if (s.status === "void") return "Void";
  if (s.balance === 0) return "Paid";
  if (s.overdue) return "Overdue";
  return s.paid > 0 ? "Partly paid" : "Sent";
}
