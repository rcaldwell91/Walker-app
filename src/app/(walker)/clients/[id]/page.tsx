import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { Card, ErrorText, LinkButton, PageTitle } from "@/components/ui";
import { InviteLink } from "@/components/invite-link";
import { AddDogForm } from "@/components/add-dog-form";
import { regenerateInvite } from "../actions";

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { supabase } = await requireRole("walker", "operator");
  const { data: client } = await supabase
    .from("clients")
    .select("*, dogs(id, name, working_on, active), client_invites(token, expires_at, redeemed_at)")
    .eq("id", id)
    .maybeSingle();
  if (!client) notFound();

  const invite = (client.client_invites ?? []).find((i) => !i.redeemed_at);
  const inviteUrl = invite ? `${process.env.NEXT_PUBLIC_APP_URL}/join/${invite.token}` : null;

  return (
    <>
      <PageTitle sub={[client.address_line, client.city].filter(Boolean).join(", ") || undefined}>
        {client.name}
      </PageTitle>

      {error ? (
        <div className="mb-4">
          <ErrorText>{error}</ErrorText>
        </div>
      ) : null}

      {client.status === "invited" ? (
        <Card className="mb-4">
          <p className="mb-2 font-medium">Send {client.name.split(" ")[0]} their link</p>
          <p className="mb-3 text-sm text-muted">
            They&apos;ll set a password and fill in their dog&apos;s details. Link expires in 14 days.
          </p>
          {inviteUrl ? (
            <InviteLink url={inviteUrl} />
          ) : (
            <form action={regenerateInvite.bind(null, client.id)}>
              <button className="text-accent underline">Make a new link</button>
            </form>
          )}
        </Card>
      ) : null}

      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Dogs</h2>
      <ul className="mb-3 flex flex-col gap-2">
        {(client.dogs ?? [])
          .filter((d) => d.active)
          .map((d) => (
            <li key={d.id}>
              <Link href={`/dogs/${d.id}`}>
                <Card>
                  <p className="font-medium">{d.name}</p>
                  {d.working_on ? <p className="text-sm text-muted">Working on: {d.working_on}</p> : null}
                </Card>
              </Link>
            </li>
          ))}
      </ul>
      <AddDogForm clientId={client.id} />

      <h2 className="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-muted">Contact</h2>
      <Card className="text-sm">
        {client.phone ? <p><a href={`tel:${client.phone}`} className="text-accent">{client.phone}</a></p> : null}
        {client.email ? <p><a href={`mailto:${client.email}`} className="text-accent">{client.email}</a></p> : null}
        {client.home_access_notes ? (
          <p className="mt-2 whitespace-pre-wrap text-muted">{client.home_access_notes}</p>
        ) : null}
        {!client.phone && !client.email && !client.home_access_notes ? (
          <p className="text-muted">Nothing here yet.</p>
        ) : null}
      </Card>

      <div className="mt-4 flex gap-2">
        <LinkButton href={`/clients/${client.id}/edit`} variant="secondary" className="flex-1">
          Edit
        </LinkButton>
        <LinkButton href={`/messages/${client.id}`} variant="secondary" className="flex-1">
          Messages
        </LinkButton>
      </div>
    </>
  );
}
