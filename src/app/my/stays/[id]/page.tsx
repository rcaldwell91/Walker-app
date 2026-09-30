import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { getTimeZone } from "@/lib/timezone";
import { Card, PageTitle, SectionTitle } from "@/components/ui";
import { BackBar } from "@/components/back-bar";
import { BoardingAnswers } from "@/components/boarding-intake";
import { StayDiary, loadDiary } from "@/components/stay-diary";
import { cents, fmtDate, fmtTime } from "@/lib/format";
import { dateKey } from "@/lib/time";
import type { PetBoarding } from "@/lib/boarding";

/** A stay, for the owner: the details, the walker's space, and the daily diary, newest first. */
export default async function MyStayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireRole("client");
  const tz = await getTimeZone();
  const { data: stay } = await supabase
    .from("boarding_stays")
    .select(
      "id, walker_id, starts_at, ends_at, start_day, end_day, nights, price_cents, notes, status, client:clients(emergency_contact, boarding_bringing, walker:walkers!clients_walker_id_fkey(business_name, profile:profiles(full_name))), stay_pets(dog:dogs(id, name, boarding)), invoice_lines(invoice_id)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!stay) notFound();
  const client = Array.isArray(stay.client) ? stay.client[0] : stay.client;
  const walker = client && (Array.isArray(client.walker) ? client.walker[0] : client.walker);
  const wp = walker && (Array.isArray(walker.profile) ? walker.profile[0] : walker.profile);
  const walkerName = walker?.business_name || wp?.full_name || "Your walker";
  const pets = (stay.stay_pets ?? [])
    .map((sp) => (Array.isArray(sp.dog) ? sp.dog[0] : sp.dog))
    .filter((d): d is NonNullable<typeof d> => !!d)
    .map((d) => ({ id: d.id, name: d.name, boarding: (d.boarding ?? {}) as PetBoarding }));
  const [days, { data: space }] = await Promise.all([
    loadDiary(supabase, id),
    supabase.from("walker_space_photos").select("id, storage_path, caption").eq("walker_id", stay.walker_id).order("created_at"),
  ]);
  const spaceUrl = (path: string) => supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  // Invoice lines are visible to the owner only once the invoice is sent (RLS).
  const invoiceId = (stay.invoice_lines ?? []).find((l) => l.invoice_id)?.invoice_id ?? null;
  const today = dateKey(new Date(), tz);
  const here = stay.status === "booked" && stay.start_day <= today && today <= stay.end_day;

  return (
    <>
      <PageTitle sub={`With ${walkerName} · ${stay.nights} night${stay.nights === 1 ? "" : "s"} · ${cents(stay.price_cents)}`}>
        {pets.map((p) => p.name).join(" & ") || "Boarding"}
      </PageTitle>

      <Card className="mb-3 flex flex-col gap-1 text-sm">
        <p>
          <span className="text-muted">Drop-off</span> {fmtDate(stay.starts_at, tz)}, {fmtTime(stay.starts_at, tz)}
        </p>
        <p>
          <span className="text-muted">Pick-up</span> {fmtDate(stay.ends_at, tz)}, {fmtTime(stay.ends_at, tz)}
        </p>
        {stay.notes ? <p className="whitespace-pre-wrap text-muted">{stay.notes}</p> : null}
        <p className="font-medium">{stay.status === "done" ? "Picked up" : here ? "Staying now" : "Booked"}</p>
        {invoiceId ? (
          <Link href={`/my/invoices/${invoiceId}`} className="mt-1 min-h-11 py-2 text-accent underline" data-stay-invoice>
            See the invoice
          </Link>
        ) : null}
      </Card>

      <SectionTitle>Daily updates</SectionTitle>
      {days.length ? (
        <StayDiary days={days} pets={pets} />
      ) : (
        <p className="text-sm text-muted">{walkerName} posts an update each day of the stay. They&apos;ll show up here, newest first.</p>
      )}

      <SectionTitle>Boarding details</SectionTitle>
      <BoardingAnswers
        pets={pets}
        emergency={client?.emergency_contact ?? null}
        bringing={client?.boarding_bringing ?? null}
        empty={<p className="text-sm text-muted">Nothing filled in yet.</p>}
      />
      <Link href="/my/intake" className="mt-2 block min-h-11 py-2 text-accent underline" data-edit-boarding>
        Update feeding, meds, sleeping and the rest
      </Link>

      {space?.length ? (
        <>
          <SectionTitle>Where they&apos;ll stay</SectionTitle>
          <ul className="grid grid-cols-2 gap-2" data-space-photos>
            {space.map((s) => (
              <li key={s.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={spaceUrl(s.storage_path)} alt={s.caption ?? `${walkerName}'s space`} className="aspect-square w-full rounded-xl object-cover" />
                {s.caption ? <p className="mt-1 text-xs text-muted">{s.caption}</p> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <BackBar href="/my/more#stays" label="More" />
    </>
  );
}
