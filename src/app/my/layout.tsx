import { requireRole } from "@/lib/session";
import { BottomNav } from "@/components/bottom-nav";
import { TimeZoneProvider } from "@/components/timezone-context";
import { getTimeZone } from "@/lib/timezone";
import { headers } from "next/headers";
import { AppSetup } from "@/components/app-setup";
import { platformFrom } from "@/lib/device";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("client");
  const tz = await getTimeZone();
  const platform = platformFrom((await headers()).get("user-agent"));
  const showGuide = !profile?.app_installed_at && !profile?.install_guide_dismissed_at;
  return (
    <TimeZoneProvider tz={tz}>
      <AppSetup platform={platform} showGuide={showGuide} />
      <div className="mx-auto max-w-md px-4 pb-24 pt-6">{children}</div>
      <BottomNav role="client" />
    </TimeZoneProvider>
  );
}
