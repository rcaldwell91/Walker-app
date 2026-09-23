/** A squad member's card: only the fields squad members may see of each other. */
export function WalkerCard({
  w,
}: {
  w: {
    full_name: string;
    handle: string;
    business_name?: string | null;
    avatar_url?: string | null;
    service_area?: string | null;
    phone?: string | null;
  };
}) {
  return (
    <div className="flex items-center gap-3">
      {w.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={w.avatar_url} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-border font-semibold text-muted">
          {w.full_name.trim()[0]?.toUpperCase()}
        </span>
      )}
      <div className="min-w-0 text-sm">
        <p className="truncate text-base font-medium">{w.full_name}</p>
        <p className="truncate text-muted">
          @{w.handle}
          {w.business_name ? ` · ${w.business_name}` : ""}
        </p>
        {w.service_area ? <p className="truncate text-muted">{w.service_area}</p> : null}
        {w.phone ? (
          <a href={`tel:${w.phone}`} className="text-accent">
            {w.phone}
          </a>
        ) : null}
      </div>
    </div>
  );
}
