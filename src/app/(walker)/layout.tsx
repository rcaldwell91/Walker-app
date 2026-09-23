import { requireRole } from "@/lib/session";
import { BottomNav } from "@/components/bottom-nav";
import { TimeZoneProvider } from "@/components/timezone-context";
import { getTimeZone } from "@/lib/timezone";
import { headers } from "next/headers";
import { AppSetup } from "@/components/app-setup";
import { platformFrom } from "@/lib/device";
import { logout } from "@/app/(auth)/actions";

export default async function WalkerLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, profile } = await requireRole("walker", "operator");
  const { data: me } = await supabase.from("walkers").select("status").eq("id", user.id).maybeSingle();
  if (profile?.role === "walker" && me?.status === "suspended") {
    return (
      <div className="mx-auto max-w-md px-4 pt-16 text-center" data-suspended>
        <h1 className="mb-2 text-2xl font-semibold">Your account is suspended</h1>
        <p className="mb-6 text-muted">
          Your public page is hidden and the walker app is locked for now. Contact the app operator to sort it out.
        </p>
        <form action={logout}>
          <button className="text-accent underline">Log out</button>
        </form>
      </div>
    );
  }
  const tz = await getTimeZone();
  const platform = platformFrom((await headers()).get("user-agent"));
  const showGuide = !profile?.app_installed_at && !profile?.install_guide_dismissed_at;
  return (
    <TimeZoneProvider tz={tz}>
      <AppSetup platform={platform} showGuide={showGuide} />
      <div className="mx-auto max-w-md px-4 pb-24 pt-6">
        {me?.status === "paused" ? (
          <p className="mb-4 rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn" data-paused>
            Your account is paused, so your public page is hidden. Everything else works as usual.
          </p>
        ) : null}
        {children}
      </div>
      <BottomNav role="walker" />
    </TimeZoneProvider>
  );
}
