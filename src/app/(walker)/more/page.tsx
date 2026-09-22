import Link from "next/link";
import { requireRole } from "@/lib/session";
import { logout } from "@/app/(auth)/actions";
import { Card, PageTitle } from "@/components/ui";

const items = [
  { href: "/profile", label: "My profile page", sub: "Bio, services, rates, background check" },
  { href: "/schedule", label: "Schedule", sub: "Bookings and repeats" },
  { href: "/squad", label: "Coverage squad", sub: "Walkers who can cover for you" },
  { href: "/incidents", label: "Incident reports" },
  { href: "/check-ins", label: "Client check-ins and suggestions" },
  { href: "/community", label: "Community", sub: "Alerts, forums, meetups" },
  { href: "/resources", label: "Resources", sub: "Tips and videos" },
  { href: "/billing", label: "Plan and fees" },
];

export default async function MorePage() {
  const { profile } = await requireRole("walker", "operator");
  return (
    <>
      <PageTitle sub={profile?.full_name}>More</PageTitle>
      <ul className="flex flex-col gap-2">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href}>
              <Card className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{i.label}</p>
                  {i.sub ? <p className="text-sm text-muted">{i.sub}</p> : null}
                </div>
                <span className="text-muted">›</span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      <form action={logout} className="mt-6">
        <button className="text-sm text-muted underline">Log out</button>
      </form>
    </>
  );
}
