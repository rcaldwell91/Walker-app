import Link from "next/link";

/**
 * The back button for every page below the top level. It sits just above the
 * tab bar, bottom left, where a thumb reaches — not in a top corner. It always
 * goes to the page's parent, so it works even when the page was opened from a
 * notification.
 */
export function BackBar({ href, label }: { href: string; label: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20">
      <div className="mx-auto max-w-md px-4 pb-2">
        <Link
          href={href}
          className="pointer-events-auto inline-flex h-11 max-w-full items-center gap-1 rounded-full border border-border bg-card/95 pl-3 pr-4 text-sm font-medium shadow-card backdrop-blur"
          data-back={href}
        >
          <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0" aria-hidden="true">
            <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="truncate">{label}</span>
        </Link>
      </div>
    </div>
  );
}
