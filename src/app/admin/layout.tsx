import { requireRole } from "@/lib/session";
import { TimeZoneProvider } from "@/components/timezone-context";
import { getTimeZone } from "@/lib/timezone";
import { logout } from "@/app/(auth)/actions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("operator");
  const tz = await getTimeZone();
  return (
    <TimeZoneProvider tz={tz}>
      <div className="mx-auto max-w-2xl px-4 pb-16 pt-6">
        <div className="mb-4 flex items-center justify-between text-sm text-muted">
          <span>Operator · {profile?.full_name}</span>
          <form action={logout}>
            <button className="underline">Log out</button>
          </form>
        </div>
        {children}
      </div>
    </TimeZoneProvider>
  );
}
