import Link from "next/link";
import { requireRole } from "@/lib/session";
import { Card, Empty, LinkButton, PageTitle } from "@/components/ui";

export default async function ClientsPage() {
  const { supabase } = await requireRole("walker", "operator");
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, status, color, group_label, dogs(id, name, active)")
    .neq("status", "archived")
    .order("name");

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
