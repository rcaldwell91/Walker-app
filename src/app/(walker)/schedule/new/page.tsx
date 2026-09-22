import { requireRole } from "@/lib/session";
import { Empty, PageTitle } from "@/components/ui";
import { getTimeZone } from "@/lib/timezone";
import { dateKey, isDateKey } from "@/lib/time";
import { BookingForm } from "../booking-form";
import { bookingOptions } from "../options";

export default async function NewBookingPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { supabase, user } = await requireRole("walker", "operator");
  const tz = await getTimeZone();
  const { date } = await searchParams;
  const { clients, services } = await bookingOptions(supabase, user.id);

  return (
    <>
      <PageTitle>Add a booking</PageTitle>
      {!clients.length ? (
        <Empty>Add a client first, then you can book them in.</Empty>
      ) : (
        <BookingForm
          bookingId={null}
          clients={clients}
          services={services}
          initial={{ date: isDateKey(date) ? date : dateKey(new Date(), tz), time: "09:00" }}
        />
      )}
    </>
  );
}
