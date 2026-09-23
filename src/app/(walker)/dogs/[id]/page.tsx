import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { getTimeZone } from "@/lib/timezone";
import { Card, Empty, PageTitle } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { DogEditForm } from "./dog-edit-form";
import { HomeworkForm } from "./homework-form";

export default async function DogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireRole("walker", "operator");
  const tz = await getTimeZone();
  const { data: dog } = await supabase
    .from("dogs")
    .select("*, client:clients(id, name), dog_notes(id, body, created_at, source), homework(id, title, status, due_at, client_response), incidents(id, severity, what_happened, occurred_at)")
    .eq("id", id)
    .maybeSingle();
  if (!dog) notFound();
  const client = Array.isArray(dog.client) ? dog.client[0] : dog.client;

  return (
    <>
      <PageTitle sub={<Link href={`/clients/${client?.id}`} className="text-accent">{client?.name}</Link>}>
        {dog.name}
      </PageTitle>

      <DogEditForm dog={dog} />

      <h2 className="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-muted">Homework</h2>
      {(dog.homework ?? []).length ? (
        <ul className="mb-3 flex flex-col gap-2">
          {dog.homework.map((h) => (
            <li key={h.id}>
              <Card className="text-sm">
                <p className="font-medium">{h.title}</p>
                <p className="text-muted">
                  {h.status === "done" ? "Done" : h.status === "in_progress" ? "They're on it" : "Assigned"}
                  {h.client_response ? ` · “${h.client_response}”` : ""}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
      <HomeworkForm dogId={dog.id} />

      <h2 className="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-muted">Notes</h2>
      {!(dog.dog_notes ?? []).length ? (
        <Empty>Notes you record on walks show up here.</Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {dog.dog_notes
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map((n) => (
              <li key={n.id}>
                <Card className="text-sm">
                  <p className="whitespace-pre-wrap">{n.body}</p>
                  <p className="mt-1 text-xs text-muted">
                    {fmtDate(n.created_at, tz)}{n.source === "voice" ? " · spoken" : ""}
                  </p>
                </Card>
              </li>
            ))}
        </ul>
      )}

      {(dog.incidents ?? []).length ? (
        <>
          <h2 className="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-muted">Incidents</h2>
          <ul className="flex flex-col gap-2">
            {dog.incidents.map((i) => (
              <li key={i.id}>
                <Card className="text-sm">
                  <p className="text-xs uppercase text-warn">{i.severity}</p>
                  <p>{i.what_happened}</p>
                  <p className="mt-1 text-xs text-muted">{fmtDate(i.occurred_at, tz)}</p>
                </Card>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
