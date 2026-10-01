import { requireRole } from "@/lib/session";
import { logout } from "@/app/(auth)/actions";
import { Card, Empty, LinkButton, PageTitle } from "@/components/ui";
import { Stars } from "@/components/score-input";
import Link from "next/link";
import { cents, fmtDate } from "@/lib/format";
import { dateKey, fmtDateKey } from "@/lib/time";
import { INVOICE_FIELDS, statusLabel, summarize } from "@/lib/billing";
import { getTimeZone } from "@/lib/timezone";
import { SuggestionForm } from "../relationship-forms";
import { NotificationSettings } from "@/components/notification-settings";
import { ThemeToggle } from "@/components/theme-toggle";
import { THEME_COOKIE, isThemeChoice } from "@/lib/theme";
import { cookies } from "next/headers";
import { BackupWalkerList, type SquadChoice } from "../backup-walkers";

export default async function MyMorePage({ searchParams }: { searchParams: Promise<{ password?: string }> }) {
  const { password } = await searchParams;
  const { supabase, user, profile } = await requireRole("client");
  const tz = await getTimeZone();
  const themeCookie = (await cookies()).get(THEME_COOKIE)?.value;
  const [{ data: rows }, { data: checkIns }, { data: choices }, { data: invoiceRows }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, status, walker:walkers!clients_walker_id_fkey(id, business_name, suggestion_box_enabled, profile:profiles(full_name))"),
    supabase
      .from("check_ins")
      .select("id, responded_at, answers")
      .not("responded_at", "is", null)
      .order("responded_at", { ascending: false })
      .limit(20),
    supabase.rpc("client_squad_choices"),
    // RLS: only this client's invoices, only once the walker has sent them.
    supabase.from("invoices").select(INVOICE_FIELDS).order("created_at", { ascending: false }).limit(50),
  ]);
  const invoices = summarize(invoiceRows ?? [], dateKey(new Date(), tz));
  const { data: stays } = await supabase
    .from("boarding_stays")
    .select("id, start_day, end_day, nights, status, stay_pets(dog:dogs(name))")
    .order("start_day", { ascending: false })
    .limit(20);

  const walkers = (rows ?? []).map((r) => {
    const w = Array.isArray(r.walker) ? r.walker[0] : r.walker;
    const p = w && (Array.isArray(w.profile) ? w.profile[0] : w.profile);
    return { id: w?.id as string, name: w?.business_name || p?.full_name || "your walker", boxOn: !!w?.suggestion_box_enabled, active: r.status === "active" };
  });

  return (
    <>
      <PageTitle>More</PageTitle>

      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Your account</h2>
      <Card className="mb-6 text-sm">
        <p className="font-medium">{profile?.full_name}</p>
        <p className="text-muted">{user.email}</p>
        <LinkButton href="/my/intake" variant="secondary" className="mt-3 w-full">
          Update your details and pets
        </LinkButton>
        <LinkButton href="/my/password" variant="secondary" className="mt-2 w-full" data-change-password>
          Change password
        </LinkButton>
        {password === "changed" ? <p className="mt-2 text-accent" role="status">Password changed.</p> : null}
      </Card>

      {stays?.length ? (
        <>
          <h2 id="stays" className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Boarding stays</h2>
          <ul className="mb-6 flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
            {stays.map((st) => (
              <li key={st.id}>
                <Link href={`/my/stays/${st.id}`} className="flex min-h-14 items-center justify-between px-4 py-3 text-sm" data-client-stay={st.id}>
                  <span>
                    {(st.stay_pets ?? []).map((sp) => (Array.isArray(sp.dog) ? sp.dog[0] : sp.dog)?.name).filter(Boolean).join(" & ")}
                    <span className="block text-xs text-muted">
                      {fmtDateKey(st.start_day)} – {fmtDateKey(st.end_day)} · {st.nights} night{st.nights === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="text-muted">{st.status === "done" ? "Picked up" : "Booked"} ›</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h2 id="invoices" className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Invoices</h2>
      {invoices.length ? (
        <ul className="mb-6 flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
          {invoices.map((i) => (
            <li key={i.id}>
              <Link href={`/my/invoices/${i.id}`} className="flex items-center justify-between px-4 py-3 text-sm" data-client-invoice={i.number}>
                <span>
                  #{i.number} · {fmtDateKey(i.period_start)} – {fmtDateKey(i.period_end)}
                  <span className="block text-xs text-muted">{i.due_on ? `Due ${fmtDateKey(i.due_on)}` : ""}</span>
                </span>
                <span className="text-right">
                  {cents(i.total)}
                  <span className={`block text-xs ${i.overdue ? "text-warn" : "text-muted"}`}>{statusLabel(i)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-6 text-sm text-muted">Invoices from your walker show up here.</p>
      )}

      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Suggestion box</h2>
      {walkers.filter((w) => w.active && w.boxOn).length ? (
        walkers
          .filter((w) => w.active && w.boxOn)
          .map((w) => (
            <Card key={w.id} className="mb-6">
              <SuggestionForm walkerId={w.id} walkerName={w.name} />
            </Card>
          ))
      ) : (
        <Empty>Your walker hasn&apos;t turned on the suggestion box.</Empty>
      )}

      <h2 className="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-muted">Your check-ins</h2>
      {checkIns?.length ? (
        <ul className="mb-6 flex flex-col gap-2">
          {checkIns.map((c) => {
            const a = (c.answers ?? {}) as { walker_satisfaction?: number; requests?: string };
            return (
              <li key={c.id}>
                <Card className="text-sm">
                  <p>
                    {fmtDate(c.responded_at, tz)}
                    {a.walker_satisfaction ? (
                      <>
                        {" · "}
                        <Stars score={a.walker_satisfaction} />
                      </>
                    ) : null}
                  </p>
                  {a.requests ? <p className="text-muted">You asked: {a.requests}</p> : null}
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mb-6 text-sm text-muted">When your walker checks in, your answers are kept here.</p>
      )}

      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Backup walkers</h2>
      <p className="mb-2 text-sm text-muted">
        Walkers your walker trusts. Approve the ones who may cover a walk and come into your home when your walker can&apos;t.
      </p>
      {(choices ?? []).length ? (
        <BackupWalkerList choices={(choices ?? []) as SquadChoice[]} />
      ) : (
        <Empty>Your walker hasn&apos;t added anyone to their squad yet.</Empty>
      )}

      <h2 className="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-muted">Notifications</h2>
      <NotificationSettings role="client" off={profile?.notify_off ?? []} />

      <h2 className="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-muted">Appearance</h2>
      <ThemeToggle initial={isThemeChoice(themeCookie) ? themeCookie : "system"} />

      <form noValidate action={logout} className="mt-8">
        <button className="text-sm text-muted underline">Log out</button>
      </form>
    </>
  );
}
