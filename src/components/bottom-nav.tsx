"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const walkerTabs = [
  { href: "/home", label: "Today" },
  { href: "/clients", label: "Clients" },
  { href: "/walk/new", label: "Walk" },
  { href: "/map", label: "Map" },
  { href: "/more", label: "More" },
];

const clientTabs = [
  { href: "/my", label: "Home" },
  { href: "/my/walks", label: "Walks" },
  { href: "/my/photos", label: "Photos" },
  { href: "/my/messages", label: "Messages" },
  { href: "/my/more", label: "More" },
];

export function BottomNav({ role }: { role: "walker" | "client" }) {
  const pathname = usePathname();
  const tabs = role === "client" ? clientTabs : walkerTabs;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-md">
        {tabs.map((t) => {
          const active = pathname === t.href || (t.href !== "/my" && pathname.startsWith(t.href));
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                className={`flex h-14 items-center justify-center text-sm font-medium ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
