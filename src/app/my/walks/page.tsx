import Link from "next/link";
import { requireRole } from "@/lib/session";
import { Card, Empty, PageTitle } from "@/components/ui";
import { fmtDate, fmtDuration, fmtTime } from "@/lib/format";
import { getTimeZone } from "@/lib/timezone";

export default async function ClientWalksPage() {
  const { supabase } = await requireRole("client");
  const tz = await getTimeZone();
  const { data: walks } = await supabase
    .from("walks")
    .select("id, status, started_at, ended_at, distance_m, service:service_types(name), walk_dogs(dog:dogs(name))")
    .in("status", ["in_progress", "done"])
    .order("started_at", { ascending: false });

  return (
    <>
      <PageTitle>Walks</PageTitle>
      {!walks?.length ? (
        <Empty>Walk reports will show up here.</Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {walks.map((w) => {
            const service = Array.isArray(w.service) ? w.service[0] : w.service;
            const names = (w.walk_dogs ?? []).map((wd) => (Array.isArray(wd.dog) ? wd.dog[0] : wd.dog)?.name).filter(Boolean);
            const live = w.status === "in_progress";
            return (
              <li key={w.id}>
                <Link href={`/my/walks/${w.id}`}>
                  <Card className={`flex items-center justify-between gap-3 ${live ? "border-accent bg-accent/10" : ""}`}>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{names.join(", ") || service?.name}</p>
                      <p className="text-sm text-muted">
                        {fmtDate(w.started_at, tz)} · {fmtTime(w.started_at, tz)}
                        {live ? " · out now" : ""}
                        {!live && w.ended_at ? ` · ${fmtDuration(w.started_at, w.ended_at)}` : ""}
                        {w.distance_m ? ` · ${(w.distance_m / 1609).toFixed(1)} mi` : ""}
                      </p>
                    </div>
                    {live ? <span className="shrink-0 text-sm font-medium text-accent">Live</span> : <span className="text-muted">›</span>}
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
