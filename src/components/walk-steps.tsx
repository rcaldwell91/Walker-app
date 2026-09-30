/** Before · Walking · Wrap-up. Where the walker is in a walk. */
export function WalkSteps({ current }: { current: 1 | 2 | 3 }) {
  const steps = ["Before", "Walking", "Wrap-up"];
  return (
    <ol className="mb-4 grid grid-cols-3 gap-2" aria-label="Walk progress" data-walk-stage={current}>
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "now" : "next";
        return (
          <li key={label} aria-current={state === "now" ? "step" : undefined} className="flex flex-col gap-1">
            <span className={`h-1.5 rounded-full ${state === "next" ? "bg-border" : "bg-accent"}`} />
            <span className={`text-xs font-medium ${state === "now" ? "text-fg" : "text-muted"}`}>
              {n}. {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
