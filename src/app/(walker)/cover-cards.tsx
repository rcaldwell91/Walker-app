import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { fmtDate, fmtTime } from "@/lib/format";
import type { Coverage, DayCoverage } from "@/lib/coverage";
import { respondToCoverage } from "./coverage-actions";

/** Someone in your squad is asking you to cover a walk. */
export function IncomingCoverCard({ r, tz }: { r: Coverage; tz: string }) {
  return (
    <Card className="mb-3 border-accent" data-incoming-cover={r.id}>
      <p className="text-sm font-medium text-accent">{r.from_name} needs coverage</p>
      <p className="font-medium">
        {r.dog_names} · {r.client_name}
      </p>
      <p className="text-sm text-muted">
        {fmtDate(r.starts_at, tz)} at {fmtTime(r.starts_at, tz)}
        {r.duration_min ? ` · ${r.duration_min} min` : ""}
      </p>
      {r.message ? <p className="mt-1 text-sm">“{r.message}”</p> : null}
      <div className="mt-3 flex gap-2">
        <form action={respondToCoverage.bind(null, r.id, false)} className="flex-1">
          <Button type="submit" variant="secondary" className="w-full">
            Decline
          </Button>
        </form>
        <form action={respondToCoverage.bind(null, r.id, true)} className="flex-1">
          <Button type="submit" className="w-full">
            Accept
          </Button>
        </form>
      </div>
    </Card>
  );
}

/** A walk you're covering for someone else. */
export function CoveringCard({ r, tz }: { r: Coverage; tz: string }) {
  return (
    <Link href={`/cover/${r.id}`} className="block" data-covering={r.id}>
      <Card className="flex items-center justify-between border-dashed">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-accent">Covering for {r.from_name}</p>
          <p className="truncate font-medium">
            {r.dog_names} · {r.client_name}
          </p>
          <p className="text-sm text-muted">Details and home access ›</p>
        </div>
        <p className="shrink-0 text-sm font-medium">{fmtTime(r.starts_at, tz)}</p>
      </Card>
    </Link>
  );
}

/** Badge on your own booking day: covered, requested, or needs coverage. */
export function CoverBadge({ c }: { c: DayCoverage }) {
  if (!c) return null;
  if (c.kind === "covered") {
    return (
      <span className="block text-sm text-accent" data-cover-state="covered">
        Covered by {c.request.to_name}
      </span>
    );
  }
  if (c.kind === "requested") {
    return (
      <span className="text-sm text-muted" data-cover-state="requested">
        Coverage requested
      </span>
    );
  }
  return (
    <span className="rounded-full bg-warn/10 px-2 py-0.5 text-sm font-medium text-warn" data-cover-state="needs">
      Needs coverage
    </span>
  );
}
