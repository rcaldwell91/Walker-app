import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { getTimeZone } from "@/lib/timezone";
import { dateKey, fmtDateKey } from "@/lib/time";
import { cents } from "@/lib/format";
import { METHOD_LABEL, statusLabel, summarize } from "@/lib/billing";
import { Card, PageTitle } from "@/components/ui";

const one = <T,>(x: T | T[] | null | undefined) => (Array.isArray(x) ? x[0] : x) ?? null;

export default async function ClientInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireRole("client");
  const tz = await getTimeZone();
  // RLS: only this client's invoices, and only once sent.
  const { data: inv } = await supabase
    .from("invoices")
    .select(
      "id, number, status, client_id, period_start, period_end, issued_on, due_on, walker:walkers(business_name, profile:profiles(full_name)), invoice_lines(id, kind, description, occurred_on, amount_cents), payments(id, amount_cents, method, received_on)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!inv) notFound();
  const s = summarize([inv], dateKey(new Date(), tz))[0];
  const w = one(inv.walker);
  const from = w?.business_name || one(w?.profile)?.full_name || "Your walker";
  const lines = [...(inv.invoice_lines ?? [])].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
  const payments = [...(inv.payments ?? [])].sort((a, b) => a.received_on.localeCompare(b.received_on));

  return (
    <>
      <Link href="/my/more#invoices" className="mb-2 inline-block text-sm text-accent">← Invoices</Link>
      <PageTitle
        sub={
          <>
            From {from} · {fmtDateKey(inv.period_start)} – {fmtDateKey(inv.period_end)}
          </>
        }
      >
        Invoice #{inv.number}{" "}
        <span className={`align-middle text-sm font-normal ${s.overdue ? "text-warn" : "text-muted"}`} data-invoice-status={statusLabel(s)}>
          {statusLabel(s)}
        </span>
      </PageTitle>

      <Card className="mb-4">
        <ul className="flex flex-col divide-y divide-border text-sm">
          {lines.map((l) => (
            <li key={l.id} className="flex justify-between py-2" data-line-kind={l.kind}>
              <span>
                {l.description}
                <span className="block text-xs text-muted">{fmtDateKey(l.occurred_on)}</span>
              </span>
              <span>{l.amount_cents < 0 ? `−${cents(-l.amount_cents)}` : cents(l.amount_cents)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-border pt-3 font-semibold">
          <span>Total</span>
          <span data-invoice-total={s.total}>{cents(s.total)}</span>
        </div>
        {payments.map((p) => (
          <div key={p.id} className="flex justify-between text-sm text-muted">
            <span>
              Paid {fmtDateKey(p.received_on)} · {METHOD_LABEL[p.method as keyof typeof METHOD_LABEL]}
            </span>
            <span>−{cents(p.amount_cents)}</span>
          </div>
        ))}
        <div className="mt-1 flex justify-between font-medium">
          <span>Balance</span>
          <span data-invoice-balance={s.balance}>{cents(s.balance)}</span>
        </div>
        <p className="mt-2 text-xs text-muted">
          {inv.issued_on ? `Sent ${fmtDateKey(inv.issued_on)}` : ""}
          {inv.due_on ? ` · due ${fmtDateKey(inv.due_on)}` : ""}
        </p>
      </Card>

      {s.balance > 0 ? (
        <Card className="border-dashed text-center" data-pay-by-card>
          <button type="button" disabled className="btn w-full rounded-xl bg-accent/40 px-4 font-medium text-accent-fg">
            Pay by card — coming soon
          </button>
          <p className="mt-2 text-sm text-muted">
            For now, pay {from} the way you usually do (cash, Venmo, Zelle, check). They&apos;ll mark it received here.
          </p>
        </Card>
      ) : (
        <p className="text-center text-accent">Paid in full. Thank you!</p>
      )}
    </>
  );
}
