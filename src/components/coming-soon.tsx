import { Empty, PageTitle } from "@/components/ui";

export function ComingSoon({ title, stage, children }: { title: string; stage: number | "phase-two"; children?: React.ReactNode }) {
  return (
    <>
      <PageTitle>{title}</PageTitle>
      <Empty>
        {children ?? "Coming in a later build stage."}{" "}
        <span className="text-xs">({stage === "phase-two" ? "Phase two" : `Stage ${stage}`})</span>
      </Empty>
    </>
  );
}
