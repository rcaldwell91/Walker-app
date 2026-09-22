import { requireRole } from "@/lib/session";
import { BottomNav } from "@/components/bottom-nav";
import { TimeZoneSync } from "@/components/timezone-sync";

export default async function WalkerLayout({ children }: { children: React.ReactNode }) {
  await requireRole("walker", "operator");
  return (
    <>
      <TimeZoneSync />
      <div className="mx-auto max-w-md px-4 pb-24 pt-6">{children}</div>
      <BottomNav role="walker" />
    </>
  );
}
