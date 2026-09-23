import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { Card, Empty, LinkButton, PageTitle } from "@/components/ui";
import { HomeworkCard } from "@/components/homework-card";
import { fmtDate } from "@/lib/format";
import { getTimeZone } from "@/lib/timezone";

export default async function MyDogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireRole("client");
  const tz = await getTimeZone();
  const { data: dog } = await supabase
    .from("dogs")
    .select("id, name, breed, sex, birthdate, weight_lbs, vet_name, vet_phone, medications, allergies, quirks, working_on, progress_summary")
    .eq("id", id)
    .maybeSingle();
  if (!dog) notFound();

  // RLS only returns notes the walker marked visible, and homework for this owner's dogs.
  const [{ data: notes }, { data: homework }] = await Promise.all([
    supabase.from("dog_notes").select("id, body, created_at").eq("dog_id", id).order("created_at", { ascending: false }).limit(50),
    supabase
      .from("homework")
      .select("id, title, instructions, status, due_at, client_response")
      .eq("dog_id", id)
      .order("created_at", { ascending: false }),
  ]);
  const open = (homework ?? []).filter((h) => h.status !== "done");
  const done = (homework ?? []).filter((h) => h.status === "done");

  const facts: [string, string | null][] = [
    ["Breed", dog.breed],
    ["Sex", dog.sex],
    ["Birthday", dog.birthdate],
    ["Weight", dog.weight_lbs ? `${dog.weight_lbs} lb` : null],
    ["Vet", [dog.vet_name, dog.vet_phone].filter(Boolean).join(" · ") || null],
    ["Medications", dog.medications],
    ["Allergies", dog.allergies],
    ["Quirks", dog.quirks],
  ];

  return (
    <>
      <PageTitle>{dog.name}</PageTitle>

      <Card className="mb-4">
        <p className="text-xs uppercase tracking-wide text-muted">Working on</p>
        <p className="font-medium">{dog.working_on || "Nothing set yet"}</p>
        {dog.progress_summary ? (
          <>
            <p className="mt-3 text-xs uppercase tracking-wide text-muted">Where they&apos;re at</p>
            <p className="whitespace-pre-wrap">{dog.progress_summary}</p>
          </>
        ) : null}
      </Card>

      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Homework</h2>
      {open.length ? (
        <ul className="mb-2 flex flex-col gap-2">
          {open.map((h) => (
            <li key={h.id}>
              <HomeworkCard hw={{ ...h, dogName: dog.name }} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-2 text-sm text-muted">No homework right now.</p>
      )}
      {done.length ? (
        <p className="mb-4 text-sm text-muted">Done: {done.map((h) => h.title).join(", ")}</p>
      ) : null}

      <h2 className="mb-2 mt-4 text-sm font-medium uppercase tracking-wide text-muted">Notes from your walker</h2>
      {notes?.length ? (
        <ul className="mb-4 flex flex-col gap-2">
          {notes.map((n) => (
            <li key={n.id}>
              <Card>
                <p className="whitespace-pre-wrap">{n.body}</p>
                <p className="mt-1 text-xs text-muted">{fmtDate(n.created_at, tz)}</p>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Your walker&apos;s notes about {dog.name} will show up here.</Empty>
      )}

      <h2 className="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-muted">Profile</h2>
      <Card>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {facts
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="whitespace-pre-wrap">{v}</dd>
              </div>
            ))}
        </dl>
        {facts.every(([, v]) => !v) ? <p className="text-sm text-muted">Nothing filled in yet.</p> : null}
      </Card>
      <LinkButton href="/my/intake" variant="secondary" className="mt-3 w-full">
        Update {dog.name}&apos;s details
      </LinkButton>
      <p className="mt-4 text-center text-sm">
        <Link href="/my/photos" className="text-accent">
          See photos
        </Link>
      </p>
    </>
  );
}
