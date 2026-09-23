import { requireRole } from "@/lib/session";
import { Button, Card, Empty, PageTitle } from "@/components/ui";
import { FindWalker } from "./find-walker";
import { WalkerCard } from "./walker-card";
import { removeLink, respondToLink } from "./actions";

type Link = {
  link_id: string;
  status: "pending" | "accepted";
  incoming: boolean;
  walker_id: string;
  handle: string;
  full_name: string;
  business_name: string;
  avatar_url: string | null;
  service_area: string | null;
  phone: string | null;
};

export default async function SquadPage() {
  const { supabase } = await requireRole("walker");
  const { data } = await supabase.rpc("squad_overview");
  const links = (data ?? []) as Link[];
  const incoming = links.filter((l) => l.status === "pending" && l.incoming);
  const outgoing = links.filter((l) => l.status === "pending" && !l.incoming);
  const squad = links.filter((l) => l.status === "accepted");

  return (
    <>
      <PageTitle sub="Walkers you trust to cover for you, and you for them. Clients approve who can come into their home.">
        Coverage squad
      </PageTitle>

      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Add a walker</h2>
      <FindWalker />

      {incoming.length ? (
        <section className="mb-6" aria-label="Requests for you">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Asking to join your squad</h2>
          <ul className="flex flex-col gap-2">
            {incoming.map((l) => (
              <li key={l.link_id}>
                <Card className="flex flex-col gap-3" data-incoming={l.handle}>
                  <WalkerCard w={l} />
                  <div className="flex gap-2">
                    <form action={respondToLink.bind(null, l.link_id, false)} className="flex-1">
                      <Button type="submit" variant="secondary" className="w-full">
                        Decline
                      </Button>
                    </form>
                    <form action={respondToLink.bind(null, l.link_id, true)} className="flex-1">
                      <Button type="submit" className="w-full">
                        Accept
                      </Button>
                    </form>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mb-6" aria-label="Your squad">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Your squad</h2>
        {squad.length ? (
          <ul className="flex flex-col gap-2">
            {squad.map((l) => (
              <li key={l.link_id}>
                <Card className="flex items-center justify-between gap-3" data-member={l.handle}>
                  <WalkerCard w={l} />
                  <form action={removeLink.bind(null, l.link_id)}>
                    <button type="submit" className="text-sm text-muted underline">
                      Remove
                    </button>
                  </form>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No one yet. Ask a walker you trust for their handle and add them above.</Empty>
        )}
      </section>

      {outgoing.length ? (
        <section aria-label="Sent requests">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Waiting on them</h2>
          <ul className="flex flex-col gap-2">
            {outgoing.map((l) => (
              <li key={l.link_id}>
                <Card className="flex items-center justify-between gap-3">
                  <WalkerCard w={l} />
                  <form action={removeLink.bind(null, l.link_id)}>
                    <button type="submit" className="text-sm text-muted underline">
                      Cancel
                    </button>
                  </form>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
