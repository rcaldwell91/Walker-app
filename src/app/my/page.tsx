import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getTimeZone } from "@/lib/timezone";
import { Card, Empty, LinkButton, PageTitle } from "@/components/ui";
import { cents, fmtDate, fmtTime, firstName } from "@/lib/format";
import { HomeworkCard } from "@/components/homework-card";
import { CheckInForm } from "./relationship-forms";
import { ApprovalPrompt, type SquadChoice } from "./backup-walkers";
import { NotificationsInbox } from "@/components/notifications-inbox";
import { notifyOpenedCheckIns } from "@/lib/notify";
import { dateKey, fmtDateKey } from "@/lib/time";
import { sendStayReminders } from "@/lib/boarding-reminders";
import { INVOICE_FIELDS, summarize } from "@/lib/billing";

export default async function ClientHome() {
  const { supabase, profile } = await requireRole("client");
  const tz = await getTimeZone();

  const [{ data: clients }, { data: dogs }, { data: recentWalks }, { data: homework }] = await Promise.all([
    supabase.from("clients").select("id, intake_completed_at, walker:walkers!clients_walker_id_fkey(business_name, handle, profile:profiles(full_name))"),
    supabase.from("dogs").select("id, name, working_on").eq("active", true).order("name"),
    supabase
      .from("walks")
      .select("id, started_at, ended_at, status, distance_m, service:service_types(name), walk_dogs(dog:dogs(name))")
      .in("status", ["in_progress", "done"])
      .order("started_at", { ascending: false })
      .limit(3),
    supabase.from("homework").select("id, title, instructions, status, due_at, dog:dogs(name)").neq("status", "done").order("created_at", { ascending: false }),
  ]);

  // Works out whether a check-in is due (walker's cadence) and opens it. No cron.
  const [{ data: openCheckIns }, { data: choices }, { data: invoiceRows }] = await Promise.all([
    supabase.rpc("open_due_check_ins", { p_tz: tz }),
    supabase.rpc("client_squad_choices"),
    supabase.from("invoices").select(INVOICE_FIELDS).eq("status", "sent"),
  ]);
  const open = summarize(invoiceRows ?? [], dateKey(new Date(), tz)).filter((i) => i.balance > 0);
  const balance = open.reduce((n, i) => n + i.balance, 0);
  const overdue = open.some((i) => i.overdue);
  const asks = ((choices ?? []) as SquadChoice[]).filter((c) => c.asked && !c.approved);
  await notifyOpenedCheckIns(openCheckIns);
  await sendStayReminders(supabase, tz);
  const today = dateKey(new Date(), tz);
  const { data: stays } = await supabase
    .from("boarding_stays")
    .select("id, start_day, end_day, stay_pets(dog:dogs(name))")
    .eq("status", "booked")
    .gte("end_day", today)
    .order("start_day");
  const walkerNameFor = (clientId: string) => {
    const c = (clients ?? []).find((x) => x.id === clientId);
    const w = c && (Array.isArray(c.walker) ? c.walker[0] : c.walker);
    const p = w && (Array.isArray(w.profile) ? w.profile[0] : w.profile);
    return w?.business_name || p?.full_name || "your walker";
  };

  const needsIntake = (clients ?? []).some((c) => !c.intake_completed_at);
  const live = (recentWalks ?? []).find((w) => w.status === "in_progress");

  return (
    <>
      <PageTitle>Hi {firstName(profile?.full_name || "there")}</PageTitle>

      {needsIntake ? (
        <Card className="mb-4 border-accent bg-accent/10">
          <p className="font-medium">Finish telling your walker about your pets</p>
          <LinkButton href="/my/intake" className="mt-3 w-full">
            Fill it in
          </LinkButton>
        </Card>
      ) : null}

      <NotificationsInbox supabase={supabase} tz={tz} here="/my" />

      {asks.map((c) => (
        <ApprovalPrompt key={`${c.client_id}-${c.coverage_walker_id}`} c={c} walkerName={walkerNameFor(c.client_id)} />
      ))}

      {((openCheckIns ?? []) as { id: string; client_id: string }[]).map((ci) => (
        <CheckInForm key={ci.id} checkInId={ci.id} walkerName={walkerNameFor(ci.client_id)} />
      ))}

      {balance ? (
        <Link href={open.length === 1 ? `/my/invoices/${open[0].id}` : "/my/more#invoices"} className="mb-4 block">
          <Card className={`flex items-center justify-between ${overdue ? "border-warn" : ""}`}>
            <span>
              <span className="block text-sm text-muted">Balance{overdue ? " · overdue" : ""}</span>
              <span className="text-xl font-semibold" data-client-balance={balance}>{cents(balance)}</span>
            </span>
            <span className="text-sm text-accent">See invoice{open.length === 1 ? "" : "s"} ›</span>
          </Card>
        </Link>
      ) : null}

      {live ? (
        <Link href={`/my/walks/${live.id}`} className="mb-4 block">
          <Card className="border-accent bg-accent/10">
            <p className="text-sm font-medium text-accent">Out on a walk now</p>
            <p className="text-muted">Since {fmtTime(live.started_at, tz)} · tap to follow along</p>
          </Card>
        </Link>
      ) : null}

      {(stays ?? []).map((st) => {
        const names = (st.stay_pets ?? []).map((sp) => (Array.isArray(sp.dog) ? sp.dog[0] : sp.dog)?.name).filter(Boolean).join(" & ");
        const now = st.start_day <= today;
        return (
          <Link key={st.id} href={`/my/stays/${st.id}`} className="mb-4 block" data-my-stay={st.id}>
            <Card className={now ? "border-accent bg-accent/10" : ""}>
              <p className={`text-sm font-medium ${now ? "text-accent" : ""}`}>{now ? `${names} is boarding now` : `Boarding booked for ${names}`}</p>
              <p className="text-muted">
                {fmtDateKey(st.start_day)} – {fmtDateKey(st.end_day)} · {now ? "tap for today's updates" : "tap to check the details"}
              </p>
            </Card>
          </Link>
        );
      })}

      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Your pets</h2>
      {!dogs?.length ? (
        <Empty>No pets on file yet.</Empty>
      ) : (
        <ul className="mb-6 flex flex-col gap-2">
          {dogs.map((d) => (
            <li key={d.id}>
              <Link href={`/my/pets/${d.id}`}>
                <Card>
                  <p className="font-medium">{d.name}</p>
                  {d.working_on ? <p className="text-sm text-muted">Working on: {d.working_on}</p> : null}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {homework?.length ? (
        <>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Homework</h2>
          <ul className="mb-6 flex flex-col gap-2">
            {homework.map((h) => (
              <li key={h.id}>
                <HomeworkCard
                  hw={{ ...h, dogName: (Array.isArray(h.dog) ? h.dog[0] : h.dog)?.name ?? "" }}
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Recent walks</h2>
      {!recentWalks?.length ? (
        <Empty>Walk reports will show up here.</Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {recentWalks.map((w) => {
            const service = Array.isArray(w.service) ? w.service[0] : w.service;
            const names = (w.walk_dogs ?? []).map((wd) => (Array.isArray(wd.dog) ? wd.dog[0] : wd.dog)?.name).filter(Boolean);
            return (
              <li key={w.id}>
                <Link href={`/my/walks/${w.id}`}>
                  <Card className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{names.join(", ") || service?.name}</p>
                      <p className="text-sm text-muted">
                        {fmtDate(w.started_at, tz)} · {fmtTime(w.started_at, tz)}
                        {w.distance_m ? ` · ${(w.distance_m / 1609).toFixed(1)} mi` : ""}
                      </p>
                    </div>
                    <span className="text-muted">›</span>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
