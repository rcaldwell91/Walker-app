import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { getTimeZone } from "@/lib/timezone";
import { dateKey, fmtDateKey } from "@/lib/time";
import { cents, fmtDate } from "@/lib/format";
import { METHOD_LABEL, statusLabel, summarize } from "@/lib/billing";
import { Button, Card, ErrorText, PageTitle } from "@/components/ui";
import { sendInvoice } from "../../actions";
import { AddLineForm, LineRow, PaymentForm, VoidButton } from "./invoice-forms";

const one = <T,>(x: T | T[] | null | undefined) => (Array.isArray(x) ? x[0] : x) ?? null;

export default async function WalkerInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { supabase, user } = await requireRole("walker", "operator");
  const tz = await getTimeZone();
  const today = dateKey(new Date(), tz);
  const { data: inv } = await supabase
    .from("invoices")
    .select(
      "id, number, status, client_id, period_start, period_end, issued_on, due_on, sent_at, voided_at, void_total_cents, client:clients(name), invoice_lines(id, kind, description, occurred_on, quantity, unit_cents, amount_cents, walk_id), payments(id, amount_cents, method, received_on, note)",
    )
    .eq("id", id)
    .eq("walker_id", user.id)
    .maybeSingle();
  if (!inv) notFound();

  const s = summarize([inv], today)[0];
  const draft = inv.status === "draft";
  const lines = [...(inv.invoice_lines ?? [])].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.kind.localeCompare(b.kind));
  const payments = [...(inv.payments ?? [])].sort((a, b) => a.received_on.localeCompare(b.received_on));

  return (
    <>
      <Link href="/money" className="mb-2 inline-block text-sm text-accent">← Money</Link>
      <PageTitle
        sub={
          <>
            {fmtDateKey(inv.period_start)} – {fmtDateKey(inv.period_end)}
            {inv.issued_on ? ` · sent ${fmtDateKey(inv.issued_on)}` : ""}
            {inv.due_on ? ` · due ${fmtDateKey(inv.due_on)}` : ""}
          </>
        }
      >
        #{inv.number} {one(inv.client)?.name}{" "}
        <span className={`align-middle text-sm font-normal ${s.overdue ? "text-warn" : "text-muted"}`} data-invoice-status={statusLabel(s)}>
          {statusLabel(s)}
        </span>
      </PageTitle>

      {error ? (
        <div className="mb-4">
          <ErrorText>{error}</ErrorText>
        </div>
      ) : null}

      {inv.status === "void" ? (
        <Card className="mb-4" data-voided>
          <p className="font-medium">Voided {fmtDate(inv.voided_at, tz)}</p>
          <p className="text-sm text-muted">
            It was for {cents(s.total)}. {one(inv.client)?.name?.split(" ")[0] ?? "The client"} doesn&apos;t owe anything on it. Its walks went
            back to unbilled and will be on the next invoice.
          </p>
        </Card>
      ) : (
      <Card className="mb-4">
        <ul className="flex flex-col divide-y divide-border">
          {lines.map((l) => (
            <LineRow
              key={l.id}
              invoiceId={inv.id}
              editable={draft}
              line={{ id: l.id, kind: l.kind, description: l.description, date: fmtDateKey(l.occurred_on), amount: l.amount_cents }}
            />
          ))}
        </ul>
        {!lines.length ? <p className="text-sm text-muted">No lines. Add one below.</p> : null}
        <div className="mt-3 flex justify-between border-t border-border pt-3 font-semibold">
          <span>Total</span>
          <span data-invoice-total={s.total}>{cents(s.total)}</span>
        </div>
        {s.paid ? (
          <div className="flex justify-between text-sm">
            <span>Paid</span>
            <span>−{cents(s.paid)}</span>
          </div>
        ) : null}
        {inv.status === "sent" ? (
          <div className="flex justify-between text-sm font-medium">
            <span>Balance</span>
            <span data-invoice-balance={s.balance}>{cents(s.balance)}</span>
          </div>
        ) : null}
      </Card>
      )}

      {draft ? (
        <>
          <AddLineForm invoiceId={inv.id} today={today} />
          <form action={sendInvoice.bind(null, inv.id)} className="mt-4">
            <Button type="submit" className="w-full py-4 text-lg" disabled={!lines.length}>
              Send to {one(inv.client)?.name?.split(" ")[0] ?? "client"} · {cents(s.total)}
            </Button>
          </form>
          <p className="mt-2 text-center text-xs text-muted">They get it in the app with a notification. Sent invoices can&apos;t be edited.</p>
        </>
      ) : null}

      {inv.status === "sent" ? (
        <>
          <h2 className="mb-2 mt-2 text-sm font-medium uppercase tracking-wide text-muted">Payments</h2>
          {payments.length ? (
            <ul className="mb-3 flex flex-col divide-y divide-border rounded-2xl border border-border bg-card text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex justify-between px-4 py-2" data-payment={p.method}>
                  <span>
                    {fmtDateKey(p.received_on)} · {METHOD_LABEL[p.method as keyof typeof METHOD_LABEL]}
                    {p.note ? <span className="block text-xs text-muted">{p.note}</span> : null}
                  </span>
                  <span>{cents(p.amount_cents)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {s.balance > 0 ? <PaymentForm invoiceId={inv.id} today={today} balance={s.balance} /> : <p className="text-sm text-accent">Paid in full.</p>}
          {!payments.length ? <VoidButton invoiceId={inv.id} /> : null}
        </>
      ) : null}
    </>
  );
}
