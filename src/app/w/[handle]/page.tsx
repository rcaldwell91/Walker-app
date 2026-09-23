import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty } from "@/components/ui";
import { Stars } from "@/components/score-input";
import { cents } from "@/lib/format";

/** Everything here comes from public_walker_profile(): public fields only, never client data. */
type PublicProfile = {
  handle: string;
  business_name: string;
  full_name: string;
  avatar_url: string | null;
  bio: string;
  service_area: string;
  background_checked: boolean;
  services: { name: string; category: string; rate_cents: number; duration_min: number }[];
  rating_count: number;
  rating_avg: number | null;
};

async function load(handle: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("public_walker_profile", { p_handle: handle });
  return (data as PublicProfile | null) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const p = await load((await params).handle);
  return { title: p ? `${p.business_name || p.full_name} · Dog walker` : "Walker not found" };
}

export default async function PublicWalkerPage({ params }: { params: Promise<{ handle: string }> }) {
  const p = await load((await params).handle);
  if (!p) notFound();
  const title = p.business_name || p.full_name;

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <div className="mb-6 flex items-center gap-4">
        {p.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.avatar_url} alt={p.full_name} className="h-20 w-20 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-border text-2xl font-semibold text-muted">
            {title.trim()[0]?.toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
          {p.business_name ? <p className="text-muted">{p.full_name}</p> : null}
          <p className="mt-1 text-sm" data-rating>
            {p.rating_count ? (
              <>
                <Stars score={Number(p.rating_avg)} /> {Number(p.rating_avg).toFixed(1)} · {p.rating_count} rating{p.rating_count === 1 ? "" : "s"}
              </>
            ) : (
              <span className="text-muted">No ratings yet</span>
            )}
          </p>
        </div>
      </div>

      {p.background_checked ? (
        <p className="mb-4 inline-block rounded-full bg-accent/10 px-3 py-1 text-sm font-medium text-accent">Background checked</p>
      ) : null}

      {p.bio ? <p className="mb-4 whitespace-pre-wrap">{p.bio}</p> : null}
      {p.service_area ? (
        <p className="mb-6 text-sm text-muted">
          <span className="font-medium text-fg">Walks in:</span> {p.service_area}
        </p>
      ) : null}

      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Services</h2>
      {p.services.length ? (
        <ul className="flex flex-col gap-2">
          {p.services.map((s) => (
            <li key={s.name}>
              <Card className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-sm text-muted">{s.duration_min} min</p>
                </div>
                <p className="font-medium">{cents(s.rate_cents)}</p>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Services and rates coming soon.</Empty>
      )}

      <p className="mt-8 text-sm text-muted">
        Already a client? <Link href="/login" className="text-accent underline">Log in</Link>
      </p>
    </main>
  );
}
