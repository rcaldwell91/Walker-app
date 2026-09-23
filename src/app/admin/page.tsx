import { requireRole } from "@/lib/session";
import { getTimeZone } from "@/lib/timezone";
import { zonedToUtc, dateKey } from "@/lib/time";
import { cents, fmtDate } from "@/lib/format";
import { Button, Card, Empty, PageTitle } from "@/components/ui";
import { setBackgroundCheck, setWalkerStatus } from "./actions";

const one = <T,>(x: T | T[] | null | undefined) => (Array.isArray(x) ? x[0] : x) ?? null;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const STATUS_STYLE: Record<string, string> = {
  active: "text-accent",
  paused: "text-muted",
  suspended: "text-warn",
};

export default async function AdminPage() {
  const { supabase } = await requireRole("operator");
  const tz = await getTimeZone();
  const monthStart = zonedToUtc(`${dateKey(new Date(), tz).slice(0, 7)}-01`, 0, 0, tz).toISOString();

  const [{ data: walkers }, { data: clients }, { data: walks }, { data: tips }] = await Promise.all([
    supabase
      .from("walkers")
      .select("id, handle, business_name, status, background_check_path, background_check_verified_at, created_at, profile:profiles(full_name)")
      .order("created_at"),
    supabase.from("clients").select("walker_id").neq("status", "archived"),
    supabase.from("walks").select("walker_id").eq("status", "done").gte("started_at", monthStart),
    supabase
      .from("tips")
      .select("id, amount_cents, status, created_at, walker:walkers(handle), client:clients(name)")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const count = (rows: { walker_id: string }[] | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.walker_id, (m.get(r.walker_id) ?? 0) + 1);
    return m;
  };
  const clientCount = count(clients);
  const walkCount = count(walks);

  // Short-lived links so the operator can open each uploaded proof.
  const proofUrls = new Map<string, string>();
  await Promise.all(
    (walkers ?? [])
      .filter((w) => w.background_check_path)
      .map(async (w) => {
        const { data } = await supabase.storage.from("documents").createSignedUrl(w.background_check_path!, 600);
        if (data?.signedUrl) proofUrls.set(w.id, data.signedUrl);
      }),
  );

  return (
    <>
      <PageTitle sub={`${walkers?.length ?? 0} walkers`}>Operator</PageTitle>

      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Walkers</h2>
      {!walkers?.length ? (
        <Empty>No walkers yet.</Empty>
      ) : (
        <ul className="mb-8 flex flex-col gap-3">
          {walkers.map((w) => {
            const check = w.background_check_verified_at ? "verified" : w.background_check_path ? "pending" : "none";
            return (
              <li key={w.id}>
                <Card className="flex flex-col gap-2" data-walker={w.handle} data-walker-status={w.status} data-check={check}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{one(w.profile)?.full_name || w.business_name || w.handle}</p>
                      <p className="text-sm text-muted">
                        @{w.handle} · {plural(clientCount.get(w.id) ?? 0, "client")} · {plural(walkCount.get(w.id) ?? 0, "walk")} this month
                      </p>
                    </div>
                    <span className={`text-sm font-medium capitalize ${STATUS_STYLE[w.status] ?? ""}`}>{w.status}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span>
                      Background check:{" "}
                      {check === "verified" ? (
                        <span className="text-accent">✓ verified {fmtDate(w.background_check_verified_at, tz)}</span>
                      ) : check === "pending" ? (
                        <span className="text-warn">uploaded, needs review</span>
                      ) : (
                        <span className="text-muted">nothing uploaded</span>
                      )}
                    </span>
                    {proofUrls.get(w.id) ? (
                      <a href={proofUrls.get(w.id)} target="_blank" rel="noreferrer" className="text-accent underline" data-view-proof>
                        View file
                      </a>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {check === "pending" ? (
                      <form action={setBackgroundCheck.bind(null, w.id, true)}>
                        <Button type="submit" className="px-3 text-sm" data-verify>Verify</Button>
                      </form>
                    ) : check === "verified" ? (
                      <form action={setBackgroundCheck.bind(null, w.id, false)}>
                        <Button type="submit" variant="secondary" className="px-3 text-sm" data-unverify>Unverify</Button>
                      </form>
                    ) : null}
                    {w.status !== "active" ? (
                      <form action={setWalkerStatus.bind(null, w.id, "active")}>
                        <Button type="submit" variant="secondary" className="px-3 text-sm" data-activate>Reactivate</Button>
                      </form>
                    ) : null}
                    {w.status !== "paused" ? (
                      <form action={setWalkerStatus.bind(null, w.id, "paused")}>
                        <Button type="submit" variant="secondary" className="px-3 text-sm" data-pause>Pause</Button>
                      </form>
                    ) : null}
                    {w.status !== "suspended" ? (
                      <form action={setWalkerStatus.bind(null, w.id, "suspended")}>
                        <Button type="submit" variant="danger" className="px-3 text-sm" data-suspend>Suspend</Button>
                      </form>
                    ) : null}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mb-8 -mt-6 text-xs text-muted">
        Paused: public page hidden, walker can still work with current clients. Suspended: public page hidden and the walker is locked out of
        the walker app.
      </p>

      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Tips</h2>
      {!tips?.length ? (
        <Empty>No tips yet.</Empty>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card text-sm">
          {tips.map((t) => (
            <li key={t.id} className="flex justify-between px-4 py-2" data-tip-status={t.status}>
              <span>
                {one(t.client)?.name} → @{one(t.walker)?.handle}
                <span className="block text-xs text-muted">{fmtDate(t.created_at, tz)}</span>
              </span>
              <span className="text-right">
                {cents(t.amount_cents)}
                <span className="block text-xs capitalize text-muted">{t.status}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
