import { Empty, PageTitle } from "@/components/ui";

export function ComingSoon({ title, stage, children }: { title: string; stage: number; children?: React.ReactNode }) {
  return (
    <>
      <PageTitle>{title}</PageTitle>
      <Empty>
        {children ?? "Coming in a later build stage."} <span className="text-xs">(Stage {stage})</span>
      </Empty>
    </>
  );
}
