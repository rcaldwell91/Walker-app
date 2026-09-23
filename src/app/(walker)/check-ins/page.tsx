import { requireRole } from "@/lib/session";
import { Card, Empty, PageTitle } from "@/components/ui";
import { Stars } from "@/components/score-input";
import { fmtDate } from "@/lib/format";
import { getTimeZone } from "@/lib/timezone";
import { notifyOpenedCheckIns } from "@/lib/notify";

type Answers = {
  walker_satisfaction?: number;
  app_satisfaction?: number;
  dog_progress?: string;
  at_home_training?: string;
  requests?: string;
};

const one = <T,>(x: T | T[] | null | undefined) => (Array.isArray(x) ? x[0] : x) ?? null;

export default async function CheckInsPage() {
  const { supabase, user } = await requireRole("walker", "operator");
  const tz = await getTimeZone();

  // Opens any check-ins that have come due on your cadence. No cron.
  const { data: opened } = await supabase.rpc("open_due_check_ins", { p_tz: tz });
  await notifyOpenedCheckIns(opened);

  const [{ data: checkIns }, { data: suggestions }, { data: ratings }] = await Promise.all([
    supabase
      .from("check_ins")
      .select("id, due_at, responded_at, answers, client:clients(name)")
      .eq("walker_id", user.id)
      .order("due_at", { ascending: false })
      .limit(100),
    supabase
      .from("suggestions")
      .select("id, body, is_anonymous, created_at, read_at, client:clients(name)")
      .eq("walker_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("ratings")
      .select("id, score, comment, created_at, client:clients(name)")
      .eq("walker_id", user.id)
      .eq("target", "walker")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const answered = (checkIns ?? []).filter((c) => c.responded_at);
  const waiting = (checkIns ?? []).filter((c) => !c.responded_at);
  const unread = (suggestions ?? []).filter((s) => !s.read_at);
  // Reading the page reads them; they stay highlighted until next visit.
  if (unread.length) {
    await supabase.from("suggestions").update({ read_at: new Date().toISOString() }).in("id", unread.map((s) => s.id));
  }
  const avg = ratings?.length ? ratings.reduce((n, r) => n + r.score, 0) / ratings.length : null;

  return (
    <>
      <PageTitle>Check-ins and suggestions</PageTitle>

      <section className="mb-6" aria-labelledby="sugg">
        <h2 id="sugg" className="mb-2 flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted">
          Suggestion box
          {unread.length ? (
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs normal-case text-accent-fg" data-unread={unread.length}>
              {unread.length} new
            </span>
          ) : null}
        </h2>
        {!suggestions?.length ? (
          <Empty>Nothing yet. Clients can send these from their app, anonymously if they like.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {suggestions.map((s) => (
              <li key={s.id}>
                <Card className={!s.read_at ? "border-accent" : ""}>
                  <p className="whitespace-pre-wrap">{s.body}</p>
                  <p className="mt-1 text-xs text-muted">
                    {s.is_anonymous ? "Anonymous" : one(s.client)?.name ?? "A client"} · {fmtDate(s.created_at, tz)}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6" aria-labelledby="ci">
        <h2 id="ci" className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Check-in answers</h2>
        {!answered.length ? (
          <Empty>
            Clients get a check-in on your cadence (set it on your profile). Their answers show up here.
          </Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {answered.map((c) => {
              const a = (c.answers ?? {}) as Answers;
              return (
                <li key={c.id}>
                  <Card className="flex flex-col gap-1 text-sm">
                    <p className="font-medium">
                      {one(c.client)?.name} <span className="font-normal text-muted">· {fmtDate(c.responded_at, tz)}</span>
                    </p>
                    {a.walker_satisfaction ? (
                      <p>
                        You: <Stars score={a.walker_satisfaction} /> · App: <Stars score={a.app_satisfaction ?? 0} />
                      </p>
                    ) : null}
                    {a.dog_progress ? <p><span className="text-muted">Progress they&apos;ve seen:</span> {a.dog_progress}</p> : null}
                    {a.at_home_training ? <p><span className="text-muted">At home:</span> {a.at_home_training}</p> : null}
                    {a.requests ? <p><span className="text-muted">Requests:</span> {a.requests}</p> : null}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
        {waiting.length ? (
          <p className="mt-2 text-sm text-muted">
            Waiting on: {waiting.map((c) => one(c.client)?.name).filter(Boolean).join(", ")}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="rt">
        <h2 id="rt" className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">
          Ratings from clients{avg ? ` · ${avg.toFixed(1)} average` : ""}
        </h2>
        {!ratings?.length ? (
          <Empty>After a walk, clients can rate it. Your average shows on your public page.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {ratings.map((r) => (
              <li key={r.id}>
                <Card className="text-sm">
                  <p>
                    <Stars score={r.score} /> <span className="text-muted">{one(r.client)?.name} · {fmtDate(r.created_at, tz)}</span>
                  </p>
                  {r.comment ? <p className="mt-1">“{r.comment}”</p> : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
