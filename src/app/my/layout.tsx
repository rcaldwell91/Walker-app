import { requireRole } from "@/lib/session";
import { BottomNav } from "@/components/bottom-nav";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  await requireRole("client");
  return (
    <>
      <div className="mx-auto max-w-md px-4 pb-24 pt-6">{children}</div>
      <BottomNav role="client" />
    </>
  );
}
