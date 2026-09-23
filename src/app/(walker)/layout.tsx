import { requireRole } from "@/lib/session";
import { BottomNav } from "@/components/bottom-nav";
import { TimeZoneSync } from "@/components/timezone-sync";
import { TimeZoneProvider } from "@/components/timezone-context";
import { getTimeZone } from "@/lib/timezone";

export default async function WalkerLayout({ children }: { children: React.ReactNode }) {
  await requireRole("walker", "operator");
  const tz = await getTimeZone();
  return (
    <TimeZoneProvider tz={tz}>
      <TimeZoneSync />
      <div className="mx-auto max-w-md px-4 pb-24 pt-6">{children}</div>
      <BottomNav role="walker" />
    </TimeZoneProvider>
  );
}
