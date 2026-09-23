import { requireRole } from "@/lib/session";
import { logout } from "@/app/(auth)/actions";
import { Card, Empty, LinkButton, PageTitle } from "@/components/ui";
import { Stars } from "@/components/score-input";
import { fmtDate } from "@/lib/format";
import { getTimeZone } from "@/lib/timezone";
import { SuggestionForm } from "../relationship-forms";

export default async function MyMorePage() {
  const { supabase, user, profile } = await requireRole("client");
  const tz = await getTimeZone();
  const [{ data: rows }, { data: checkIns }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, status, walker:walkers!clients_walker_id_fkey(id, business_name, suggestion_box_enabled, profile:profiles(full_name))"),
    supabase
      .from("check_ins")
      .select("id, responded_at, answers")
      .not("responded_at", "is", null)
      .order("responded_at", { ascending: false })
      .limit(20),
  ]);

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
          Update your details and dogs
        </LinkButton>
      </Card>

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

      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Coverage walkers</h2>
      <Empty>
        Soon you&apos;ll be able to approve backup walkers who can take a walk when yours is away.{" "}
        <span className="text-xs">(Stage 6)</span>
      </Empty>

      <form action={logout} className="mt-8">
        <button className="text-sm text-muted underline">Log out</button>
      </form>
    </>
  );
}
