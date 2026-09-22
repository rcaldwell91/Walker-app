import Link from "next/link";
import { requireRole } from "@/lib/session";
import { Card, Empty, LinkButton, PageTitle } from "@/components/ui";
import { fmtTime, firstName } from "@/lib/format";

export default async function TodayPage() {
  const { supabase, profile } = await requireRole("walker", "operator");

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [{ data: bookings }, { data: activeWalk }, { count: clientCount }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, starts_at, duration_min, status, client:clients(name), service:service_types(name), booking_dogs(dog:dogs(id, name))")
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString())
      .neq("status", "cancelled")
      .order("starts_at"),
    supabase.from("walks").select("id, started_at").eq("status", "in_progress").maybeSingle(),
    supabase.from("clients").select("id", { count: "exact", head: true }),
  ]);

  return (
    <>
      <PageTitle sub={new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}>
        Hey {firstName(profile?.full_name || "there")}
      </PageTitle>

      {activeWalk ? (
        <Link href={`/walk/${activeWalk.id}`} className="mb-4 block">
          <Card className="border-accent bg-accent/10">
            <p className="text-sm font-medium text-accent">Walk in progress</p>
            <p className="text-muted">Started {fmtTime(activeWalk.started_at)} · tap to open</p>
          </Card>
        </Link>
      ) : (
        <LinkButton href="/walk/new" className="mb-4 w-full">
          Start a walk
        </LinkButton>
      )}

      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Today</h2>
      {!bookings?.length ? (
        <Empty>
          {clientCount ? (
            <>Nothing scheduled today. <Link href="/schedule" className="text-accent underline">Add a booking</Link></>
          ) : (
            <>Start by <Link href="/clients/new" className="text-accent underline">adding your first client</Link>.</>
          )}
        </Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {bookings.map((b) => {
            const client = Array.isArray(b.client) ? b.client[0] : b.client;
            const service = Array.isArray(b.service) ? b.service[0] : b.service;
            const dogs = (b.booking_dogs ?? []).map((bd) => (Array.isArray(bd.dog) ? bd.dog[0] : bd.dog)).filter(Boolean);
            return (
              <li key={b.id}>
                <Card className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {dogs.length ? dogs.map((d) => d!.name).join(", ") : client?.name}
                    </p>
                    <p className="text-sm text-muted">
                      {service?.name} · {b.duration_min} min
                      {b.status === "needs_coverage" ? " · needs coverage" : ""}
                    </p>
                  </div>
                  <p className="text-sm font-medium">{fmtTime(b.starts_at)}</p>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
