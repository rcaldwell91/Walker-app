import Link from "next/link";
import { requireRole } from "@/lib/session";
import { Card, Empty, LinkButton, PageTitle } from "@/components/ui";
import { fmtDate, fmtTime, firstName } from "@/lib/format";
import { HomeworkCard } from "@/components/homework-card";

export default async function ClientHome() {
  const { supabase, profile } = await requireRole("client");

  const [{ data: clients }, { data: dogs }, { data: recentWalks }, { data: homework }] = await Promise.all([
    supabase.from("clients").select("id, intake_completed_at, walker:walkers(business_name, handle, profile:profiles(full_name))"),
    supabase.from("dogs").select("id, name, working_on, progress_summary").eq("active", true).order("name"),
    supabase
      .from("walks")
      .select("id, started_at, ended_at, status, distance_m, service:service_types(name), walk_dogs(dog:dogs(name))")
      .in("status", ["in_progress", "done"])
      .order("started_at", { ascending: false })
      .limit(3),
    supabase.from("homework").select("id, title, instructions, status, due_at, dog:dogs(name)").neq("status", "done").order("created_at", { ascending: false }),
  ]);

  const needsIntake = (clients ?? []).some((c) => !c.intake_completed_at);
  const live = (recentWalks ?? []).find((w) => w.status === "in_progress");

  return (
    <>
      <PageTitle>Hi {firstName(profile?.full_name || "there")}</PageTitle>

      {needsIntake ? (
        <Card className="mb-4 border-accent bg-accent/10">
          <p className="font-medium">Finish telling your walker about your dog</p>
          <LinkButton href="/my/intake" className="mt-3 w-full">
            Fill it in
          </LinkButton>
        </Card>
      ) : null}

      {live ? (
        <Link href={`/my/walks/${live.id}`} className="mb-4 block">
          <Card className="border-accent bg-accent/10">
            <p className="text-sm font-medium text-accent">Out on a walk now</p>
            <p className="text-muted">Since {fmtTime(live.started_at)} · tap to follow along</p>
          </Card>
        </Link>
      ) : null}

      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Your dogs</h2>
      {!dogs?.length ? (
        <Empty>No dogs on file yet.</Empty>
      ) : (
        <ul className="mb-6 flex flex-col gap-2">
          {dogs.map((d) => (
            <li key={d.id}>
              <Link href={`/my/dogs/${d.id}`}>
                <Card>
                  <p className="font-medium">{d.name}</p>
                  {d.working_on ? <p className="text-sm text-muted">Working on: {d.working_on}</p> : null}
                  {d.progress_summary ? <p className="mt-1 text-sm">{d.progress_summary}</p> : null}
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
                        {fmtDate(w.started_at)} · {fmtTime(w.started_at)}
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
