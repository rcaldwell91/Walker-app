import { requireRole } from "@/lib/session";
import { getTimeZone } from "@/lib/timezone";
import { dateKey } from "@/lib/time";
import { INVOICE_FIELDS, METHOD_LABEL, statusLabel, summarize } from "@/lib/billing";

const one = <T,>(x: T | T[] | null | undefined) => (Array.isArray(x) ? x[0] : x) ?? null;
const money = (c: number) => (c / 100).toFixed(2);
const cell = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One CSV: every invoice, payment and tip, one row each, for a spreadsheet or an accountant. */
export async function GET() {
  const { supabase, user } = await requireRole("walker", "operator");
  const tz = await getTimeZone();
  const today = dateKey(new Date(), tz);
  const [{ data: invoices }, { data: payments }, { data: tips }] = await Promise.all([
    supabase.from("invoices").select(`${INVOICE_FIELDS}, client:clients(name)`).eq("walker_id", user.id).neq("status", "draft").order("number"),
    supabase
      .from("payments")
      .select("amount_cents, method, received_on, note, client:clients(name), invoice:invoices(number)")
      .eq("walker_id", user.id)
      .order("received_on"),
    supabase.from("tips").select("amount_cents, status, created_at, client:clients(name)").eq("walker_id", user.id).neq("status", "cancelled").order("created_at"),
  ]);

  const rows: (string | number | null)[][] = [["type", "date", "client", "invoice", "amount", "paid", "balance", "status", "method", "due", "note"]];
  const names = new Map((invoices ?? []).map((i) => [i.id, one(i.client)?.name ?? ""]));
  for (const s of summarize(invoices ?? [], today)) {
    rows.push(["invoice", s.issued_on, names.get(s.id) ?? "", s.number, money(s.total), money(s.paid), money(s.balance), statusLabel(s), "", s.due_on, ""]);
  }
  for (const p of payments ?? []) {
    rows.push(["payment", p.received_on, one(p.client)?.name ?? "", one(p.invoice)?.number ?? "", money(p.amount_cents), "", "", "", METHOD_LABEL[p.method as keyof typeof METHOD_LABEL], "", p.note]);
  }
  for (const t of tips ?? []) {
    rows.push(["tip", dateKey(new Date(t.created_at), tz), one(t.client)?.name ?? "", "", money(t.amount_cents), "", "", t.status, "", "", ""]);
  }
  const csv = rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="walker-money-${today}.csv"`,
      "cache-control": "no-store",
    },
  });
}
