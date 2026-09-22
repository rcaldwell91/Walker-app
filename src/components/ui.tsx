import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-4 ${className}`}>{children}</div>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-semibold leading-tight">{children}</h1>
      {sub ? <p className="mt-1 text-sm text-muted">{sub}</p> : null}
    </div>
  );
}

const btnBase =
  "btn inline-flex items-center justify-center gap-2 rounded-xl px-4 font-medium transition active:scale-[0.98] disabled:opacity-50";
const variants = {
  primary: "bg-accent text-accent-fg",
  secondary: "border border-border bg-card",
  danger: "bg-warn text-white",
  ghost: "text-accent",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof variants }) {
  return <button className={`${btnBase} ${variants[variant]} ${className}`} {...props} />;
}

export function LinkButton({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: keyof typeof variants }) {
  return <Link className={`${btnBase} ${variants[variant]} ${className}`} {...props} />;
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-border bg-card px-3 py-2 text-base outline-none focus:border-accent";

export function Input(props: ComponentProps<"input">) {
  return <input className={inputClass} {...props} />;
}
export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea className={`${inputClass} min-h-24`} {...props} />;
}
export function Select(props: ComponentProps<"select">) {
  return <select className={inputClass} {...props} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
      {children}
    </div>
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">{children}</p>;
}
