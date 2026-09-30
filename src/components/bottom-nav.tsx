"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string; icon: React.ReactNode; match?: (p: string) => boolean };

const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const Icon = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
    {children}
  </svg>
);
const icons = {
  today: (
    <Icon>
      <rect x="4" y="5" width="16" height="15" rx="2.5" {...s} />
      <path d="M4 10h16M9 3v4M15 3v4" {...s} />
    </Icon>
  ),
  pets: (
    <Icon>
      <circle cx="7" cy="9" r="1.8" {...s} />
      <circle cx="11" cy="6" r="1.8" {...s} />
      <circle cx="15.5" cy="7" r="1.8" {...s} />
      <circle cx="18" cy="11" r="1.6" {...s} />
      <path d="M8.5 17.5c0-2.5 2-5 4.5-5s4.5 2.5 3.5 5-3 1.5-4 1.5-4 1-4-1.5Z" {...s} />
    </Icon>
  ),
  walk: (
    <Icon>
      <circle cx="13" cy="4.5" r="1.8" {...s} />
      <path d="m9 21 2.5-6 2.5 2v4M10 11l1.5-4 3.5 2 2 3M11.5 7 8 9l-1 3.5" {...s} />
    </Icon>
  ),
  map: (
    <Icon>
      <path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" {...s} />
      <path d="M9 4v14M15 6v14" {...s} />
    </Icon>
  ),
  more: (
    <Icon>
      <circle cx="6" cy="12" r="1.4" fill="currentColor" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      <circle cx="18" cy="12" r="1.4" fill="currentColor" />
    </Icon>
  ),
  home: (
    <Icon>
      <path d="M4 11 12 4l8 7v8.5a1 1 0 0 1-1 1h-4.5V15h-5v5.5H5a1 1 0 0 1-1-1V11Z" {...s} />
    </Icon>
  ),
  photos: (
    <Icon>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" {...s} />
      <circle cx="9" cy="10" r="1.8" {...s} />
      <path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" {...s} />
    </Icon>
  ),
  messages: (
    <Icon>
      <path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 17h-8l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 5Z" {...s} />
    </Icon>
  ),
};

// The walker's More groups live under these paths, so "More" stays lit there.
const MORE_PATHS = ["/more", "/money", "/hours", "/schedule", "/check-ins", "/squad", "/profile", "/coming-soon", "/billing", "/install", "/incidents", "/cover", "/boarding", "/settings"];

const walkerTabs: Tab[] = [
  { href: "/home", label: "Today", icon: icons.today, match: (p) => p === "/home" || p.startsWith("/report") },
  { href: "/clients", label: "Pets", icon: icons.pets, match: (p) => p.startsWith("/clients") || p.startsWith("/pets") || p.startsWith("/messages") },
  { href: "/walk/new", label: "Walk", icon: icons.walk, match: (p) => p.startsWith("/walk") },
  { href: "/map", label: "Map", icon: icons.map, match: (p) => p.startsWith("/map") },
  { href: "/more", label: "More", icon: icons.more, match: (p) => MORE_PATHS.some((m) => p === m || p.startsWith(`${m}/`)) },
];

const clientTabs: Tab[] = [
  { href: "/my", label: "Home", icon: icons.home, match: (p) => p === "/my" || p.startsWith("/my/pets") || p.startsWith("/my/stays") },
  { href: "/my/walks", label: "Walks", icon: icons.walk },
  { href: "/my/photos", label: "Photos", icon: icons.photos },
  { href: "/my/messages", label: "Messages", icon: icons.messages },
  { href: "/my/more", label: "More", icon: icons.more, match: (p) => p.startsWith("/my/more") || p.startsWith("/my/invoices") || p.startsWith("/my/intake") || p === "/install" },
];

export function BottomNav({ role }: { role: "walker" | "client" }) {
  const pathname = usePathname();
  const tabs = role === "client" ? clientTabs : walkerTabs;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="Main">
      <ul className="mx-auto flex max-w-md">
        {tabs.map((t) => {
          const active = t.match ? t.match(pathname) : pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium ${active ? "text-accent" : "text-muted"}`}
              >
                {t.icon}
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
