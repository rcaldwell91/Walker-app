/**
 * What shows the instant a page is tapped, while its data is on the way: the
 * page's shape (title, a few cards) in quiet placeholder grey. The tabs and
 * back button stay put, so a tap always gets an answer right away.
 */
export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div data-loading aria-busy="true" aria-label="Loading">
      <div className="mb-4">
        <div className="h-7 w-2/5 animate-pulse rounded-lg bg-border" />
        <div className="mt-2 h-4 w-3/5 animate-pulse rounded bg-border/70" />
      </div>
      <div className="mb-4 h-12 w-full animate-pulse rounded-xl bg-border/70" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl border border-border bg-card" />
        ))}
      </div>
    </div>
  );
}
