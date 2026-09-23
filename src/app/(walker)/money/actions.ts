"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { getTimeZone } from "@/lib/timezone";
import { dateKey, fmtDateKey, isDateKey } from "@/lib/time";
import { billNow, METHOD_LABEL, summarize, INVOICE_FIELDS, type Schedule } from "@/lib/billing";
import { cents } from "@/lib/format";
import { clientProfileId, notify } from "@/lib/notify";

export type MoneyState = { error?: string; done?: number } | undefined;

function refresh(invoiceId?: string) {
  revalidatePath("/money");
  if (invoiceId) revalidatePath(`/money/invoices/${invoiceId}`);
}

export async function setBillingSchedule(clientId: string, form: FormData) {
  const schedule = String(form.get("billing_schedule") ?? "") as Schedule;
  if (!["per_walk", "weekly", "monthly"].includes(schedule)) return;
  const { supabase, user } = await requireRole("walker");
  await supabase.from("clients").update({ billing_schedule: schedule }).eq("id", clientId).eq("walker_id", user.id);
  revalidatePath(`/clients/${clientId}`);
}

export async function billClientNow(clientId: string) {
  const { supabase, user } = await requireRole("walker");
  const id = await billNow(supabase, user.id, clientId, await getTimeZone());
  refresh();
  redirect(id ? `/money/invoices/${id}` : `/clients/${clientId}?error=${encodeURIComponent("Nothing to bill yet: no finished walks or extras.")}`);
}

const dollars = z.coerce.number().refine((n) => Number.isFinite(n) && n > 0 && n <= 100000, "Enter an amount, like 5 or 12.50");

const lineSchema = z.object({
  kind: z.enum(["extra", "discount"]),
  description: z.string().trim().min(1, "Describe it, e.g. Key pickup").max(200),
  amount: dollars,
  occurred_on: z.string().refine(isDateKey, "Pick a date"),
});

async function draftInvoice(invoiceId: string) {
  const { supabase, user } = await requireRole("walker");
  const { data } = await supabase
    .from("invoices")
    .select("id, client_id, status")
    .eq("id", invoiceId)
    .eq("walker_id", user.id)
    .maybeSingle();
  return { supabase, user, invoice: data };
}

export async function addLine(invoiceId: string, _: MoneyState, form: FormData): Promise<MoneyState> {
  const parsed = lineSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { supabase, user, invoice } = await draftInvoice(invoiceId);
  if (!invoice || invoice.status !== "draft") return { error: "Only drafts can change" };
  const d = parsed.data;
  const unit = Math.round(d.amount * 100) * (d.kind === "discount" ? -1 : 1);
  const { error } = await supabase.from("invoice_lines").insert({
    walker_id: user.id,
    client_id: invoice.client_id,
    invoice_id: invoiceId,
    kind: d.kind,
    description: d.description,
    occurred_on: d.occurred_on,
    unit_cents: unit,
  });
  if (error) return { error: error.message };
  refresh(invoiceId);
  return { done: Date.now() };
}

const editSchema = z.object({
  description: z.string().trim().min(1).max(200),
  amount: z.coerce.number().refine((n) => Number.isFinite(n) && n >= 0 && n <= 100000, "Enter an amount"),
});

export async function updateLine(lineId: string, invoiceId: string, _: MoneyState, form: FormData): Promise<MoneyState> {
  const parsed = editSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { supabase, invoice } = await draftInvoice(invoiceId);
  if (!invoice || invoice.status !== "draft") return { error: "Only drafts can change" };
  const { data: line } = await supabase.from("invoice_lines").select("kind").eq("id", lineId).maybeSingle();
  if (!line) return { error: "Line not found" };
  const cents = Math.round(parsed.data.amount * 100) * (line.kind === "discount" ? -1 : 1);
  const { error } = await supabase
    .from("invoice_lines")
    .update({ description: parsed.data.description, unit_cents: cents, quantity: 1 })
    .eq("id", lineId)
    .eq("invoice_id", invoiceId);
  if (error) return { error: error.message };
  refresh(invoiceId);
  return { done: Date.now() };
}

/** Extras and discounts can be removed; a walk line goes back to unbilled. */
export async function removeLine(lineId: string, invoiceId: string) {
  const { supabase, invoice } = await draftInvoice(invoiceId);
  if (!invoice || invoice.status !== "draft") return;
  const { data: line } = await supabase.from("invoice_lines").select("kind").eq("id", lineId).maybeSingle();
  if (line?.kind === "walk") await supabase.from("invoice_lines").update({ invoice_id: null }).eq("id", lineId);
  else await supabase.from("invoice_lines").delete().eq("id", lineId);
  refresh(invoiceId);
}

export async function sendInvoice(invoiceId: string) {
  const { supabase, invoice } = await draftInvoice(invoiceId);
  if (!invoice || invoice.status !== "draft") return;
  const { error } = await supabase.from("invoices").update({ status: "sent" }).eq("id", invoiceId);
  if (!error) {
    const tz = await getTimeZone();
    const { data } = await supabase.from("invoices").select(INVOICE_FIELDS).eq("id", invoiceId).single();
    const s = data ? summarize([data], dateKey(new Date(), tz))[0] : null;
    const { data: me } = await supabase.from("profiles").select("full_name").eq("id", (await requireRole("walker")).user.id).maybeSingle();
    await notify([await clientProfileId(invoice.client_id)], {
      kind: "invoice",
      title: `New invoice from ${me?.full_name ?? "your walker"}`,
      body: s ? `${cents(s.total)}${data?.due_on ? `, due ${fmtDateKey(data.due_on)}` : ""}` : "Tap to see it.",
      url: `/my/invoices/${invoiceId}`,
    });
  }
  refresh(invoiceId);
}

const paymentSchema = z.object({
  amount: dollars,
  method: z.enum(Object.keys(METHOD_LABEL) as [string, ...string[]]),
  received_on: z.string().refine(isDateKey, "Pick the date you got it"),
  note: z.string().trim().max(200).optional(),
});

export async function recordPayment(invoiceId: string, _: MoneyState, form: FormData): Promise<MoneyState> {
  const parsed = paymentSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { supabase, user } = await requireRole("walker");
  const tz = await getTimeZone();
  const { data } = await supabase.from("invoices").select(INVOICE_FIELDS).eq("id", invoiceId).eq("walker_id", user.id).maybeSingle();
  if (!data || data.status !== "sent") return { error: "Send the invoice before recording payments" };
  const s = summarize([data], dateKey(new Date(), tz))[0];
  const amount = Math.round(parsed.data.amount * 100);
  if (amount > s.balance) return { error: `That's more than the ${cents(s.balance)} still owed` };
  const { error } = await supabase.from("payments").insert({
    walker_id: user.id,
    client_id: data.client_id,
    invoice_id: invoiceId,
    amount_cents: amount,
    method: parsed.data.method,
    received_on: parsed.data.received_on,
    note: parsed.data.note || null,
  });
  if (error) return { error: error.message };
  const left = s.balance - amount;
  await notify([await clientProfileId(data.client_id)], {
    kind: "payment",
    title: "Payment received, thank you",
    body: `${cents(amount)} by ${METHOD_LABEL[parsed.data.method as keyof typeof METHOD_LABEL]}. ${left ? `${cents(left)} left on invoice #${data.number}.` : `Invoice #${data.number} is paid.`}`,
    url: `/my/invoices/${invoiceId}`,
  });
  refresh(invoiceId);
  return { done: Date.now() };
}

export async function setNetDays(form: FormData) {
  const days = Number(form.get("invoice_net_days"));
  if (!Number.isInteger(days) || days < 0 || days > 120) return;
  const { supabase, user } = await requireRole("walker");
  await supabase.from("walkers").update({ invoice_net_days: days }).eq("id", user.id);
  refresh();
}

/** Void a sent invoice with no payments. Its walks go back to unbilled for the next invoice. */
export async function voidInvoice(invoiceId: string) {
  const { supabase, user } = await requireRole("walker");
  const { data: inv } = await supabase.from("invoices").select("id, client_id, number, status").eq("id", invoiceId).eq("walker_id", user.id).maybeSingle();
  if (!inv || inv.status !== "sent") return;
  const { error } = await supabase.from("invoices").update({ status: "void" }).eq("id", invoiceId);
  if (error) redirect(`/money/invoices/${invoiceId}?error=${encodeURIComponent(error.message)}`);
  const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  await notify([await clientProfileId(inv.client_id)], {
    kind: "invoice",
    title: `Invoice #${inv.number} was voided`,
    body: `${me?.full_name ?? "Your walker"} cancelled it. You don't owe anything on it.`,
    url: `/my/invoices/${invoiceId}`,
  });
  refresh(invoiceId);
  revalidatePath(`/clients/${inv.client_id}`);
}
