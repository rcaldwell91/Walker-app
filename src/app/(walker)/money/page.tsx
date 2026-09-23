import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getTimeZone } from "@/lib/timezone";
import { dateKey, fmtDateKey } from "@/lib/time";
import { cents, fmtDate } from "@/lib/format";
import { draftDueInvoices, INVOICE_FIELDS, statusLabel, summarize } from "@/lib/billing";
import { Button, Card, Empty, Input, LinkButton, PageTitle } from "@/components/ui";
import { setNetDays } from "./actions";

const one = <T,>(x: T | T[] | null | undefined) => (Array.isArray(x) ? x[0] : x) ?? null;

export default async function MoneyPage() {
  const { supabase, user } = await requireRole("walker", "operator");
  const tz = await getTimeZone();
  const today = dateKey(new Date(), tz);
  const monthStart = `${today.slice(0, 7)}-01`;

  // Drafts invoices for any billing period that has finished. No cron.
  await draftDueInvoices(supabase, user.id, tz);

  const [{ data: rows }, { data: payments }, { data: unbilled }, { data: tips }, { data: me }] = await Promise.all([
    supabase
      .from("invoices")
      .select(`${INVOICE_FIELDS}, client:clients(name)`)
      .eq("walker_id", user.id)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("payments").select("amount_cents, received_on").eq("walker_id", user.id).gte("received_on", monthStart),
    supabase.from("invoice_lines").select("amount_cents").eq("walker_id", user.id).is("invoice_id", null),
    supabase
      .from("tips")
      .select("id, amount_cents, status, created_at, client:clients(name)")
      .eq("walker_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("walkers").select("invoice_net_days").eq("id", user.id).single(),
  ]);

  const names = new Map((rows ?? []).map((r) => [r.id, one(r.client)?.name ?? "Client"]));
  const invoices = summarize(rows ?? [], today);
  const drafts = invoices.filter((i) => i.status === "draft");
  const open = invoices.filter((i) => i.status === "sent" && i.balance > 0);

  const byClient = new Map<string, { name: string; balance: number; overdue: boolean; count: number }>();
  for (const i of open) {
    const c = byClient.get(i.client_id) ?? { name: names.get(i.id) ?? "Client", balance: 0, overdue: false, count: 0 };
    c.balance += i.balance;
    c.overdue ||= i.overdue;
    c.count++;
    byClient.set(i.client_id, c);
  }
  const outstanding = open.reduce((n, i) => n + i.balance, 0);
  const paidMonth = (payments ?? []).reduce((n, p) => n + p.amount_cents, 0);
  const unbilledTotal = (unbilled ?? []).reduce((n, l) => n + l.amount_cents, 0);
  const liveTips = (tips ?? []).filter((t) => t.status !== "cancelled");
  const tipsMonth = liveTips.filter((t) => dateKey(new Date(t.created_at), tz) >= monthStart).reduce((n, t) => n + t.amount_cents, 0);

  return (
    <>
      <PageTitle sub="Finished walks become invoice lines at your rate. Drafts appear here when a billing period ends.">Money</PageTitle>

      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        <Card className="px-2">
          <p className="text-xl font-semibold" data-outstanding={outstanding}>{cents(outstanding)}</p>
          <p className="text-xs text-muted">Owed to you</p>
        </Card>
        <Card className="px-2">
          <p className="text-xl font-semibold" data-paid-month={paidMonth}>{cents(paidMonth)}</p>
          <p className="text-xs text-muted">Paid this month</p>
        </Card>
        <Card className="px-2">
          <p className="text-xl font-semibold" data-tips-month={tipsMonth}>{cents(tipsMonth)}</p>
          <p className="text-xs text-muted">Tips this month</p>
        </Card>
      </div>

      {drafts.length ? (
        <section className="mb-6" aria-labelledby="drafts">
          <h2 id="drafts" className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Ready to review and send</h2>
          <ul className="flex flex-col gap-2">
            {drafts.map((i) => (
              <li key={i.id}>
                <Link href={`/money/invoices/${i.id}`} data-draft={i.id}>
                  <Card className="flex items-center justify-between border-accent">
                    <span>
                      <span className="font-medium">{names.get(i.id)}</span>
                      <span className="block text-xs text-muted">
                        #{i.number} · {fmtDateKey(i.period_start)} – {fmtDateKey(i.period_end)}
                      </span>
                    </span>
                    <span className="font-semibold">{cents(i.total)} →</span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mb-6" aria-labelledby="owed">
        <h2 id="owed" className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Outstanding by client</h2>
        {!byClient.size ? (
          <Empty>Nobody owes you anything right now.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...byClient.entries()].map(([clientId, c]) => (
              <li key={clientId}>
                <Link href={`/clients/${clientId}#billing`}>
                  <Card className="flex items-center justify-between" data-owed-client={c.name}>
                    <span>
                      <span className="font-medium">{c.name}</span>
                      <span className="block text-xs text-muted">{c.count} open invoice{c.count === 1 ? "" : "s"}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {c.overdue ? <span className="rounded-full bg-warn px-2 py-0.5 text-xs text-white">Overdue</span> : null}
                      <span className="font-semibold">{cents(c.balance)}</span>
                    </span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {unbilledTotal ? (
          <p className="mt-2 text-sm text-muted" data-unbilled={unbilledTotal}>
            {cents(unbilledTotal)} of finished walks not invoiced yet. It&apos;ll be drafted when each client&apos;s period ends,
            or tap Bill now on a client.
          </p>
        ) : null}
      </section>

      <section className="mb-6" aria-labelledby="all">
        <h2 id="all" className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Invoices</h2>
        {!invoices.length ? (
          <Empty>No invoices yet. Finish a walk and it shows up here.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
            {invoices.map((i) => (
              <li key={i.id}>
                <Link href={`/money/invoices/${i.id}`} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span>
                    #{i.number} {names.get(i.id)}
                    <span className="block text-xs text-muted">{i.issued_on ? `Sent ${fmtDateKey(i.issued_on)}` : "Not sent"}</span>
                  </span>
                  <span className="text-right">
                    {cents(i.total)}
                    <span className={`block text-xs ${i.overdue ? "text-warn" : "text-muted"}`} data-status={statusLabel(i)}>
                      {statusLabel(i)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6" aria-labelledby="tips">
        <h2 id="tips" className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Tips</h2>
        {!liveTips.length ? (
          <Empty>Clients can tip after a walk. Tips are recorded now and paid out once card payments are set up.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card text-sm">
            {liveTips.map((t) => (
              <li key={t.id} className="flex justify-between px-4 py-2">
                <span>
                  {one(t.client)?.name} <span className="text-muted">· {fmtDate(t.created_at, tz)}</span>
                </span>
                <span>
                  {cents(t.amount_cents)} <span className="text-xs text-muted">{t.status === "paid" ? "Paid out" : "Recorded"}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card className="mb-4">
        <form action={setNetDays} className="flex items-end gap-2">
          <label className="flex-1">
            <span className="mb-1 block text-sm font-medium">Invoices are due after</span>
            <Input name="invoice_net_days" type="number" min={0} max={120} defaultValue={me?.invoice_net_days ?? 7} inputMode="numeric" />
          </label>
          <span className="pb-2 text-sm">days</span>
          <Button type="submit" variant="secondary">Save</Button>
        </form>
        <p className="mt-2 text-xs text-muted">Each client&apos;s billing schedule (per walk, weekly, monthly) is on their page.</p>
      </Card>

      <LinkButton href="/money/export" variant="secondary" className="w-full" prefetch={false}>
        Download CSV (invoices, payments, tips)
      </LinkButton>
    </>
  );
}
