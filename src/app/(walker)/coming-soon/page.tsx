import { requireRole } from "@/lib/session";
import { NavList, PageTitle } from "@/components/ui";
import { BackBar } from "@/components/back-bar";
import { PHASE_TWO } from "@/lib/phase-two";

export default async function ComingSoonPage() {
  await requireRole("walker", "operator");
  return (
    <>
      <PageTitle sub="Not built yet. They'll show up here when they are.">Coming soon</PageTitle>
      <div data-coming-soon>
        <NavList items={PHASE_TWO.map((p) => ({ ...p, disabled: true }))} />
      </div>
      <BackBar href="/more" label="More" />
    </>
  );
}
