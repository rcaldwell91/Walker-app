import { Button, Card } from "@/components/ui";
import { Stars } from "@/components/score-input";
import { dismissApprovalAsk, setCoverageApproval } from "./coverage-actions";

/** A row of client_squad_choices(): one of the client's walker's squad members. */
export type SquadChoice = {
  client_id: string;
  walker_id: string;
  coverage_walker_id: string;
  handle: string;
  full_name: string;
  avatar_url: string | null;
  rating_avg: number | null;
  rating_count: number;
  approved: boolean;
  asked: boolean;
};

function Face({ c }: { c: SquadChoice }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {c.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.avatar_url} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-border font-semibold text-muted">
          {c.full_name.trim()[0]?.toUpperCase()}
        </span>
      )}
      <div className="min-w-0 text-sm">
        <p className="truncate text-base font-medium">{c.full_name}</p>
        <p className="truncate text-muted">@{c.handle}</p>
        <p className="text-muted">
          {c.rating_count ? (
            <>
              <Stars score={Number(c.rating_avg)} /> {Number(c.rating_avg).toFixed(1)} ({c.rating_count})
            </>
          ) : (
            "No ratings yet"
          )}
        </p>
      </div>
    </div>
  );
}

/** /my/more: approve or revoke each squad member. */
export function BackupWalkerList({ choices }: { choices: SquadChoice[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {choices.map((c) => (
        <li key={`${c.client_id}-${c.coverage_walker_id}`}>
          <Card className="flex items-center justify-between gap-3" data-choice={c.handle} data-approved={c.approved ? "yes" : "no"}>
            <Face c={c} />
            <form action={setCoverageApproval.bind(null, c.client_id, c.coverage_walker_id, !c.approved)}>
              <Button type="submit" variant={c.approved ? "secondary" : "primary"} className="px-3 text-sm">
                {c.approved ? "Revoke" : "Approve"}
              </Button>
            </form>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/** /my: the walker asked the client to approve someone. */
export function ApprovalPrompt({ c, walkerName }: { c: SquadChoice; walkerName: string }) {
  return (
    <Card className="mb-4 border-accent" data-approval-ask={c.handle}>
      <p className="mb-2 font-medium">{walkerName} would like a backup walker</p>
      <Face c={c} />
      <p className="mt-2 text-sm text-muted">
        If you approve, {c.full_name.split(" ")[0]} can cover a walk when {walkerName} can&apos;t, including coming into your
        home on those days. You can revoke this any time under More.
      </p>
      <div className="mt-3 flex gap-2">
        <form action={dismissApprovalAsk.bind(null, c.client_id, c.coverage_walker_id)} className="flex-1">
          <Button type="submit" variant="secondary" className="w-full">
            Not now
          </Button>
        </form>
        <form action={setCoverageApproval.bind(null, c.client_id, c.coverage_walker_id, true)} className="flex-1">
          <Button type="submit" className="w-full">
            Approve
          </Button>
        </form>
      </div>
    </Card>
  );
}
