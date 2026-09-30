import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { Button, Card, ErrorText, PageTitle, SectionTitle } from "@/components/ui";
import { BackBar } from "@/components/back-bar";
import { StayDiary, loadDiary } from "@/components/stay-diary";
import { cents } from "@/lib/format";
import { fmtDateKey } from "@/lib/time";
import { stayPrice } from "@/lib/boarding";
import { billStay, endStay } from "../../actions";

/** Pick-up: every day together, total nights, all photos, the price, and billing. */
export default async function StaySummaryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const { supabase, user } = await requireRole("walker", "operator");
  const { data: stay } = await supabase
    .from("boarding_stays")
    .select("id, start_day, end_day, nights, night_cents, extra_pet_cents, price_cents, status, client:clients(name), stay_pets(dog:dogs(id, name)), invoice_lines(id, invoice_id, invoice:invoices(id, number, status))")
    .eq("id", id)
    .eq("walker_id", user.id)
    .maybeSingle();
  if (!stay) notFound();
  const client = Array.isArray(stay.client) ? stay.client[0] : stay.client;
  const pets = (stay.stay_pets ?? []).map((sp) => (Array.isArray(sp.dog) ? sp.dog[0] : sp.dog)).filter((d): d is NonNullable<typeof d> => !!d);
  const days = await loadDiary(supabase, id);
  const photoCount = days.reduce((n, d) => n + d.photos.length, 0);
  const computed = stayPrice(stay.nights, pets.length, stay.night_cents, stay.extra_pet_cents);
  const invoice = (stay.invoice_lines ?? [])
    .map((l) => (Array.isArray(l.invoice) ? l.invoice[0] : l.invoice))
    .find((i) => i && i.status !== "void");

  return (
    <>
      <PageTitle sub={`${client?.name} · ${fmtDateKey(stay.start_day)} – ${fmtDateKey(stay.end_day)}`}>Stay summary</PageTitle>

      <Card className="grid grid-cols-3 gap-2 text-center" data-summary-totals>
        <div>
          <p className="text-2xl font-semibold" data-total-nights>{stay.nights}</p>
          <p className="text-xs text-muted">night{stay.nights === 1 ? "" : "s"}</p>
        </div>
        <div>
          <p className="text-2xl font-semibold">{days.length}</p>
          <p className="text-xs text-muted">update{days.length === 1 ? "" : "s"}</p>
        </div>
        <div>
          <p className="text-2xl font-semibold">{photoCount}</p>
          <p className="text-xs text-muted">photo{photoCount === 1 ? "" : "s"}</p>
        </div>
      </Card>

      <SectionTitle>Bill</SectionTitle>
      <Card className="flex flex-col gap-1 text-sm" data-stay-bill>
        <p className="flex justify-between">
          <span>
            {pets[0]?.name ?? "First pet"} · {stay.nights} × {cents(stay.night_cents)}
          </span>
          <span>{cents(stay.nights * stay.night_cents)}</span>
        </p>
        {pets.slice(1).map((p) => (
          <p key={p.id} className="flex justify-between">
            <span>
              Extra pet · {p.name} · {stay.nights} × {cents(stay.extra_pet_cents)}
            </span>
            <span>{cents(stay.nights * stay.extra_pet_cents)}</span>
          </p>
        ))}
        {stay.price_cents !== computed ? (
          <p className="flex justify-between text-muted">
            <span>{stay.price_cents > computed ? "Price adjustment" : "Discount"}</span>
            <span>{cents(stay.price_cents - computed)}</span>
          </p>
        ) : null}
        <p className="mt-1 flex justify-between border-t border-border pt-2 font-medium">
          <span>Total</span>
          <span data-stay-total>{cents(stay.price_cents)}</span>
        </p>
      </Card>

      <ErrorText>{error}</ErrorText>
      <div className="mt-3 flex flex-col gap-2">
        {stay.status === "booked" ? (
          <form action={endStay.bind(null, id)}>
            <Button className="h-14 w-full text-lg" data-end-stay>
              Picked up: end the stay
            </Button>
            <p className="mt-1 text-xs text-muted">Puts the stay on {client?.name}&apos;s bill. You send the invoice next.</p>
          </form>
        ) : null}
        {stay.status === "done" ? (
          <form action={billStay.bind(null, id)}>
            <Button className="h-14 w-full text-lg" data-bill-stay>
              {invoice ? `Open invoice #${invoice.number}` : "Bill this stay"}
            </Button>
            <p className="mt-1 text-xs text-muted">
              {invoice ? (invoice.status === "sent" ? "Sent." : "Draft: open it to send.") : `Makes a draft invoice with everything unbilled for ${client?.name}.`}
            </p>
          </form>
        ) : null}
      </div>

      <SectionTitle>Every day</SectionTitle>
      {days.length ? <StayDiary days={days} pets={pets} /> : <p className="text-sm text-muted">No daily updates posted.</p>}

      <BackBar href={`/boarding/${id}`} label="Stay" />
    </>
  );
}
