import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { Button, Card, PageTitle } from "@/components/ui";
import { getTimeZone } from "@/lib/timezone";
import { dateKey, timeOfDay } from "@/lib/time";
import { BookingForm } from "../booking-form";
import { bookingOptions } from "../options";
import { setBookingCancelled } from "../actions";

export default async function EditBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireRole("walker", "operator");
  const tz = await getTimeZone();
  const [{ data: b }, { clients, services }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, client_id, service_type_id, starts_at, duration_min, status, repeat_weekdays, repeat_until, booking_dogs(dog_id)")
      .eq("id", id)
      .maybeSingle(),
    bookingOptions(supabase, user.id),
  ]);
  if (!b) notFound();

  const start = new Date(b.starts_at);
  const cancelled = b.status === "cancelled";

  return (
    <>
      <PageTitle sub={b.repeat_weekdays?.length ? "Changes apply to every repeat." : undefined}>Edit booking</PageTitle>

      {cancelled ? (
        <Card className="mb-4 border-warn/40">
          <p className="mb-3 font-medium text-warn">This booking is cancelled.</p>
          <form action={setBookingCancelled.bind(null, b.id, false)}>
            <Button type="submit" variant="secondary" className="w-full">
              Restore it
            </Button>
          </form>
        </Card>
      ) : null}

      <BookingForm
        bookingId={b.id}
        clients={clients}
        services={services}
        initial={{
          client_id: b.client_id,
          service_type_id: b.service_type_id,
          date: dateKey(start, tz),
          time: timeOfDay(start, tz).hhmm,
          duration_min: b.duration_min,
          repeat_weekdays: b.repeat_weekdays ?? [],
          repeat_until: b.repeat_until,
          dog_ids: (b.booking_dogs ?? []).map((bd) => bd.dog_id),
        }}
      />

      {!cancelled ? (
        <form action={setBookingCancelled.bind(null, b.id, true)} className="mt-6">
          <Button type="submit" variant="danger" className="w-full">
            {b.repeat_weekdays?.length ? "Cancel all repeats" : "Cancel booking"}
          </Button>
        </form>
      ) : null}
    </>
  );
}
