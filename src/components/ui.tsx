import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function Card({ children, className = "", ...rest }: ComponentProps<"div">) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-4 shadow-card ${className}`} {...rest}>
      {children}
    </div>
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
  danger: "bg-warn text-warn-fg",
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

export function SectionTitle({ children, id, className = "" }: { children: ReactNode; id?: string; className?: string }) {
  return (
    <h2 id={id} className={`mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-muted first:mt-0 ${className}`}>
      {children}
    </h2>
  );
}

/** A tappable list of places to go: big rows, a line of explanation, an optional badge. */
export function NavList({
  items,
}: {
  items: { href?: string; label: string; sub?: string; badge?: ReactNode; disabled?: boolean }[];
}) {
  return (
    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      {items.map((i) => {
        const body = (
          <>
            <span className="min-w-0">
              <span className="block font-medium">{i.label}</span>
              {i.sub ? <span className="block text-sm text-muted">{i.sub}</span> : null}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {i.badge}
              {i.disabled ? null : <span className="text-lg text-muted" aria-hidden="true">›</span>}
            </span>
          </>
        );
        return (
          <li key={i.label}>
            {i.href && !i.disabled ? (
              <Link href={i.href} className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 active:bg-bg">
                {body}
              </Link>
            ) : (
              <div className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 opacity-50" aria-disabled="true">
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function Badge({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "warn" | "muted" }) {
  const tones = { accent: "bg-accent text-accent-fg", warn: "bg-warn text-warn-fg", muted: "bg-border text-fg" };
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

/**
 * The one line under a form's button: what went wrong, or that it worked.
 * Its space is always there, so nothing moves when it appears.
 */
export function FormStatus({ error, ok }: { error?: string | null; ok?: string | null | false | 0 }) {
  return (
    <p className={`min-h-5 text-sm ${error ? "text-warn" : "text-accent"}`} role="status">
      {error || ok || ""}
    </p>
  );
}
