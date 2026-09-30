import Link from "next/link";
import { requireRole } from "@/lib/session";
import { Badge, Card, Empty, LinkButton, NavList, PageTitle, SectionTitle } from "@/components/ui";

export default async function PetsAndClientsPage() {
  const { supabase, user } = await requireRole("walker", "operator");
  const [{ data: clients }, { data: unreadRows }, { count: incidents }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, status, color, group_label, profile_id, dogs(id, name, breed, active)")
      .eq("walker_id", user.id) // not clients you're covering for someone else
      .neq("status", "archived")
      .order("name"),
    supabase.from("messages").select("client_id, sender_id").is("read_at", null).neq("sender_id", user.id),
    supabase.from("incidents").select("id", { count: "exact", head: true }).eq("walker_id", user.id),
  ]);
  // Unread = sent by the client themselves.
  const unreadFor = (c: { id: string; profile_id: string | null }) =>
    (unreadRows ?? []).filter((m) => m.client_id === c.id && m.sender_id === c.profile_id).length;
  const petCount = (clients ?? []).reduce((n, c) => n + (c.dogs ?? []).filter((d) => d.active).length, 0);

  return (
    <>
      <PageTitle sub={clients?.length ? `${clients.length} client${clients.length === 1 ? "" : "s"} · ${petCount} pet${petCount === 1 ? "" : "s"}` : undefined}>
        Pets & clients
      </PageTitle>
      {!clients?.length ? (
        <Empty>No clients yet. Add one and send them their link.</Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {clients.map((c) => {
            const pets = (c.dogs ?? []).filter((d) => d.active);
            return (
              <li key={c.id}>
                <Card className="p-0">
                  <Link href={`/clients/${c.id}`} className="flex min-h-14 items-center gap-3 px-4 pt-3">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color ?? "var(--border)" }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.name}</span>
                      {c.group_label ? <span className="block truncate text-sm text-muted">{c.group_label}</span> : null}
                    </span>
                    {unreadFor(c) ? (
                      <span data-unread={unreadFor(c)}>
                        <Badge>{unreadFor(c)} new</Badge>
                      </span>
                    ) : null}
                    {c.status === "invited" ? <Badge tone="muted">Invited</Badge> : null}
                    <span className="text-lg text-muted" aria-hidden="true">›</span>
                  </Link>
                  <div className="flex flex-wrap gap-2 px-4 pb-3 pt-2">
                    {pets.length ? (
                      pets.map((d) => (
                        <Link key={d.id} href={`/pets/${d.id}`} className="flex min-h-11 items-center rounded-full border border-border bg-bg px-4 text-sm font-medium" data-pet-chip={d.name}>
                          {d.name}
                          {d.breed ? <span className="ml-1 font-normal text-muted">· {d.breed}</span> : null}
                        </Link>
                      ))
                    ) : (
                      <span className="text-sm text-muted">No pets yet</span>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <LinkButton href="/clients/new" className="mt-4 w-full">
        Add a client
      </LinkButton>

      <SectionTitle>Records</SectionTitle>
      <NavList items={[{ href: "/incidents", label: "Incident reports", sub: incidents ? `${incidents} on file` : "None filed" }]} />
    </>
  );
}
