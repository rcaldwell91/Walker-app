import { requireRole } from "@/lib/session";
import { Badge, NavList, PageTitle } from "@/components/ui";

/** Everything that isn't a tab, in groups. Every walker sees every group for now. */
export default async function MorePage() {
  const { supabase, user, profile } = await requireRole("walker", "operator");
  const [{ count: newSuggestions }, { count: drafts }, { count: incoming }] = await Promise.all([
    supabase.from("suggestions").select("id", { count: "exact", head: true }).eq("walker_id", user.id).is("read_at", null),
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("walker_id", user.id).eq("status", "draft"),
    supabase.from("coverage_requests").select("id", { count: "exact", head: true }).eq("to_walker_id", user.id).eq("status", "open"),
  ]);

  return (
    <>
      <PageTitle sub={profile?.full_name}>More</PageTitle>
      <NavList
        items={[
          { href: "/clients", label: "Pets & clients", sub: "Everyone you walk for, their pets, incident reports" },
          {
            href: "/money",
            label: "Money",
            sub: "Invoices, payments, tips, my rates",
            badge: drafts ? <Badge>{drafts} to send</Badge> : undefined,
          },
          { href: "/hours", label: "Schedule & hours", sub: "Bookings, hours this week and month, time off" },
          {
            href: "/check-ins",
            label: "Check-ins & suggestions",
            sub: "Check-in answers, the suggestion box, ratings",
            badge: newSuggestions ? <Badge>{newSuggestions} new</Badge> : undefined,
          },
          {
            href: "/squad",
            label: "Coverage squad",
            sub: "Walkers who can cover for you",
            badge: incoming ? <Badge tone="warn">{incoming} asking</Badge> : undefined,
          },
          { href: "/profile", label: "Profile & account", sub: "Public profile, notifications, appearance, home screen, background check, log out" },
          { href: "/coming-soon", label: "Coming soon", sub: "Alerts, forums, meetups, resources, marketplace" },
        ]}
      />
    </>
  );
}
