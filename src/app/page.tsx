import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-12">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-muted">Walker App</p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight">
          Run your dog walking business from one place.
        </h1>
        <p className="mt-3 text-muted">
          Notes, photos, routes, and messages for the clients you already have. One tap
          wherever possible, because you&apos;re holding a leash.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <Link
          href="/signup"
          className="btn flex items-center justify-center rounded-xl bg-accent px-4 font-medium text-accent-fg"
        >
          I&apos;m a dog walker
        </Link>
        <Link
          href="/login"
          className="btn flex items-center justify-center rounded-xl border border-border bg-card px-4 font-medium"
        >
          Log in
        </Link>
      </div>
      <p className="text-sm text-muted">
        Dog owner? Your walker will send you a link to join.
      </p>
    </main>
  );
}
