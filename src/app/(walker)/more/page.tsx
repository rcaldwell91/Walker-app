import { requireRole } from "@/lib/session";
import { Badge, NavList, PageTitle } from "@/components/ui";

/** Everything that isn't a tab, in groups. Every walker sees every group for now. */
export default async function MorePage() {
  const { supabase, user, profile } = await requireRole("walker", "operator");
  const [{ count: newSuggestions }, { count: drafts }, { count: incoming }] = await Promise.all([
    supabase.from("suggestions").select("id", { count: "exact", head: true }).eq("walker_id", user.id).is("read_at", null),
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("walker_id", user.id).eq("status", "draft"),
    // The badge counts what the Squad page shows: walkers asking to join yours.
    supabase.from("squad_links").select("id", { count: "exact", head: true }).eq("recipient_id", user.id).eq("status", "pending"),
  ]);

  return (
    <>
      <PageTitle sub={profile?.full_name}>More</PageTitle>
      <NavList
        items={[
          { href: "/clients", label: "Pets & clients", sub: "Everyone you walk for and their pets" },
          {
            href: "/money",
            label: "Money",
            sub: "Invoices, payments, tips, my rates",
            badge: drafts ? <Badge>{drafts} to send</Badge> : undefined,
          },
          { href: "/hours", label: "Schedule & hours", sub: "Bookings, boarding, hours this week and month, time off" },
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
            badge: incoming ? <Badge>{incoming} asking</Badge> : undefined,
          },
          { href: "/records", label: "Records", sub: "Incident reports" },
          { href: "/settings", label: "Business settings", sub: "Boarding times, early pick-ups, photos, how clients pay, tips" },
          { href: "/profile", label: "Profile & account", sub: "Public profile, notifications, appearance, home screen, background check, log out" },
          { href: "/coming-soon", label: "Coming soon", sub: "Alerts, forums, meetups, resources, marketplace" },
        ]}
      />
    </>
  );
}
