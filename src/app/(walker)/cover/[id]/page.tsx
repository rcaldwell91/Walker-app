import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { Button, Card, ErrorText, LinkButton, PageTitle } from "@/components/ui";
import { fmtDate, fmtTime } from "@/lib/format";
import { getTimeZone } from "@/lib/timezone";
import { fetchMyCoverage, inWindow } from "@/lib/coverage";
import { cancelCoverage } from "../../coverage-actions";
import { IncomingCoverCard } from "../../cover-cards";

const STATUS = { open: "Waiting for an answer", accepted: "Accepted", declined: "Declined", cancelled: "Cancelled" } as const;

export default async function CoverPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const { supabase } = await requireRole("walker");
  const tz = await getTimeZone();
  const r = (await fetchMyCoverage(supabase)).find((x) => x.id === id);
  if (!r) notFound();

  const now = Date.now();
  const open = r.incoming && r.status === "accepted" && inWindow(r, now);
  const before = now < new Date(r.access_from).getTime();
  const over = now >= new Date(r.access_until).getTime();

  // Only returns rows while the database says the window is open (RLS).
  const [{ data: client }, { data: dogs }] = open
    ? await Promise.all([
        supabase
          .from("clients")
          .select("name, address_line, city, phone, emergency_contact, home_access_notes")
          .eq("id", r.client_id)
          .maybeSingle(),
        supabase
          .from("dogs")
          .select("id, name, breed, working_on, progress_summary, quirks, medications, allergies, vet_name, vet_phone")
          .in("id", r.dog_ids),
      ])
    : [{ data: null }, { data: null }];

  return (
    <>
      <PageTitle sub={`${fmtDate(r.starts_at, tz)} at ${fmtTime(r.starts_at, tz)}${r.duration_min ? ` · ${r.duration_min} min` : ""}`}>
        {r.incoming ? `Covering for ${r.from_name}` : `${r.to_name} covering`}
      </PageTitle>
      {error ? (
        <div className="mb-4">
          <ErrorText>{error}</ErrorText>
        </div>
      ) : null}

      {r.incoming && r.status === "open" && !over ? <IncomingCoverCard r={r} tz={tz} /> : null}

      <Card className="mb-4">
        <p className="font-medium">
          {r.dog_names} · {r.client_name}
        </p>
        <p className="text-sm text-muted" data-cover-status={r.status}>
          {STATUS[r.status]}
          {over && r.status === "accepted" ? " · done" : ""}
        </p>
        {r.message ? <p className="mt-2 text-sm">“{r.message}”</p> : null}
      </Card>

      {r.incoming && r.status === "accepted" ? (
        open && client ? (
          <>
            <Card className="mb-4 border-accent" data-access="open">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Home access</p>
              <p className="whitespace-pre-wrap font-medium" data-home-notes>
                {client.home_access_notes || "No notes. Check with " + r.from_name + "."}
              </p>
              <p className="mt-2 text-sm">
                {[client.address_line, client.city].filter(Boolean).join(", ")}
                {client.phone ? (
                  <>
                    {" · "}
                    <a href={`tel:${client.phone}`} className="text-accent">
                      {client.phone}
                    </a>
                  </>
                ) : null}
              </p>
              {client.emergency_contact ? <p className="text-sm text-muted">Emergency: {client.emergency_contact}</p> : null}
              <p className="mt-2 text-xs text-muted">
                You can see this until {fmtDate(r.access_until, tz)} at {fmtTime(r.access_until, tz)}.
              </p>
            </Card>
            <ul className="mb-4 flex flex-col gap-2">
              {(dogs ?? []).map((d) => (
                <li key={d.id}>
                  <Card className="text-sm" data-dog={d.name}>
                    <p className="text-base font-medium">
                      {d.name}
                      {d.breed ? <span className="font-normal text-muted"> · {d.breed}</span> : null}
                    </p>
                    {d.working_on ? <p><span className="text-muted">Working on:</span> {d.working_on}</p> : null}
                    {d.progress_summary ? <p className="text-muted">{d.progress_summary}</p> : null}
                    {d.quirks ? <p className="text-warn">{d.quirks}</p> : null}
                    {d.medications ? <p><span className="text-muted">Meds:</span> {d.medications}</p> : null}
                    {d.allergies ? <p><span className="text-muted">Allergies:</span> {d.allergies}</p> : null}
                    {d.vet_name || d.vet_phone ? <p><span className="text-muted">Vet:</span> {[d.vet_name, d.vet_phone].filter(Boolean).join(" · ")}</p> : null}
                  </Card>
                </li>
              ))}
            </ul>
            <LinkButton href={`/walk/new?dogs=${r.dog_ids.join(",")}`} className="mb-4 h-14 w-full text-lg">
              Start the walk
            </LinkButton>
          </>
        ) : (
          <Card className="mb-4" data-access={before ? "not-yet" : "closed"}>
            <p className="text-sm">
              {before
                ? `Dog details and home access open on ${fmtDate(r.access_from, tz)}, the day before the walk.`
                : `This cover has ended. Access to ${r.client_name}'s details has closed.`}
            </p>
          </Card>
        )
      ) : null}

      {(r.status === "accepted" || r.status === "open") && !over ? (
        <form action={cancelCoverage.bind(null, r.id)}>
          <Button type="submit" variant="secondary" className="w-full">
            {r.status === "open" && !r.incoming ? "Withdraw the request" : "Cancel the cover"}
          </Button>
        </form>
      ) : null}
    </>
  );
}
