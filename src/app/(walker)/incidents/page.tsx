import Link from "next/link";
import { requireRole } from "@/lib/session";
import { Card, Empty, LinkButton, PageTitle } from "@/components/ui";
import { fmtDate, fmtTime } from "@/lib/format";
import { getTimeZone } from "@/lib/timezone";

const SEVERITY = {
  minor: "border-border",
  moderate: "border-warn/50",
  serious: "border-warn",
} as const;

export default async function IncidentsPage() {
  const { supabase } = await requireRole("walker", "operator");
  const tz = await getTimeZone();
  const { data: incidents } = await supabase
    .from("incidents")
    .select("id, severity, what_happened, action_taken, occurred_at, client_notified_at, walk_id, dog:dogs(id, name, client:clients(name))")
    .order("occurred_at", { ascending: false })
    .limit(200);

  return (
    <>
      <div className="mb-2 flex items-start justify-between gap-2">
        <PageTitle sub="Everything you've reported, newest first.">Incident reports</PageTitle>
      </div>
      {!incidents?.length ? (
        <Empty>
          No incidents. If something happens on a walk, tap <span className="font-medium">Incident</span> on the walk screen.
        </Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {incidents.map((i) => {
            const dog = Array.isArray(i.dog) ? i.dog[0] : i.dog;
            const client = dog && (Array.isArray(dog.client) ? dog.client[0] : dog.client);
            return (
              <li key={i.id}>
                <Card className={`border-2 ${SEVERITY[i.severity as keyof typeof SEVERITY] ?? ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">
                      {dog ? (
                        <Link href={`/dogs/${dog.id}`} className="text-accent">
                          {dog.name}
                        </Link>
                      ) : (
                        "Whole group"
                      )}
                      {client ? <span className="font-normal text-muted"> · {client.name}</span> : null}
                    </p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs capitalize ${i.severity === "minor" ? "bg-border" : "bg-warn/10 text-warn"}`}>
                      {i.severity}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{i.what_happened}</p>
                  {i.action_taken ? <p className="mt-1 text-sm text-muted">What you did: {i.action_taken}</p> : null}
                  <p className="mt-1 text-xs text-muted">
                    {fmtDate(i.occurred_at, tz)} · {fmtTime(i.occurred_at, tz)}
                    {i.walk_id ? (
                      <>
                        {" · "}
                        <Link href={`/walk/${i.walk_id}`} className="text-accent">
                          walk
                        </Link>
                      </>
                    ) : null}
                  </p>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <LinkButton href="/walk/new" variant="ghost" className="mt-4 w-full">
        Start a walk
      </LinkButton>
    </>
  );
}
