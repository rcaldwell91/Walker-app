import Link from "next/link";
import { requireRole } from "@/lib/session";
import { Card, Empty, LinkButton, PageTitle } from "@/components/ui";

export default async function ClientsPage() {
  const { supabase, user } = await requireRole("walker", "operator");
  const [{ data: clients }, { data: unreadRows }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, status, color, group_label, profile_id, dogs(id, name, active)")
      .eq("walker_id", user.id) // not clients you're covering for someone else
      .neq("status", "archived")
      .order("name"),
    supabase.from("messages").select("client_id, sender_id").is("read_at", null).neq("sender_id", user.id),
  ]);
  // Unread = sent by the client themselves.
  const unreadFor = (c: { id: string; profile_id: string | null }) =>
    (unreadRows ?? []).filter((m) => m.client_id === c.id && m.sender_id === c.profile_id).length;

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <PageTitle>Clients</PageTitle>
        <LinkButton href="/clients/new" variant="secondary" className="mb-4">
          + Add
        </LinkButton>
      </div>
      {!clients?.length ? (
        <Empty>No clients yet. Add one and send them their link.</Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {clients.map((c) => (
            <li key={c.id}>
              <Link href={`/clients/${c.id}`}>
                <Card className="flex items-center gap-3">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: c.color ?? "var(--border)" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="truncate text-sm text-muted">
                      {(c.dogs ?? []).filter((d) => d.active).map((d) => d.name).join(", ") || "No dogs yet"}
                      {c.group_label ? ` · ${c.group_label}` : ""}
                    </p>
                  </div>
                  {unreadFor(c) ? (
                    <span className="shrink-0 rounded-full bg-accent px-2 py-1 text-xs text-accent-fg" data-unread={unreadFor(c)}>
                      {unreadFor(c)} new
                    </span>
                  ) : null}
                  {c.status === "invited" ? (
                    <span className="rounded-full bg-warn/10 px-2 py-1 text-xs text-warn">Invited</span>
                  ) : null}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
