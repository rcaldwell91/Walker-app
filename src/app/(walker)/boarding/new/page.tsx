import { requireRole } from "@/lib/session";
import { getTimeZone } from "@/lib/timezone";
import { PageTitle } from "@/components/ui";
import { BackBar } from "@/components/back-bar";
import { addDays, dateKey, isDateKey } from "@/lib/time";
import { BookStayForm } from "./book-form";

export default async function NewStayPage({ searchParams }: { searchParams: Promise<{ client?: string; pet?: string; date?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireRole("walker", "operator");
  const tz = await getTimeZone();
  const today = dateKey(new Date(), tz);
  const [{ data: clients }, { data: me }] = await Promise.all([
    supabase.from("clients").select("id, name, status, dogs(id, name, active)").eq("walker_id", user.id).order("name"),
    supabase.from("walkers").select("boarding_night_cents, boarding_extra_pet_cents, boarding_dropoff_time, boarding_pickup_time").eq("id", user.id).single(),
  ]);
  const list = (clients ?? [])
    .filter((c) => c.status !== "archived" || c.id === sp.client)
    .map((c) => ({ id: c.id, name: c.name, pets: (c.dogs ?? []).filter((d) => d.active !== false).map((d) => ({ id: d.id, name: d.name })) }));
  const start = isDateKey(sp.date) ? sp.date : today;
  const back = sp.pet ? { href: `/pets/${sp.pet}`, label: "Pet" } : sp.client ? { href: `/clients/${sp.client}`, label: "Client" } : { href: "/boarding", label: "Boarding" };

  return (
    <>
      <PageTitle sub="Drop-off and pick-up at your place">Book a stay</PageTitle>
      <BookStayForm
        clients={list}
        initialClient={sp.client ?? list.find((c) => c.pets.some((p) => p.id === sp.pet))?.id ?? ""}
        initialPet={sp.pet ?? ""}
        startDay={start}
        endDay={addDays(start, 1)}
        nightCents={me?.boarding_night_cents ?? null}
        extraCents={me?.boarding_extra_pet_cents ?? null}
        dropoffTime={String(me?.boarding_dropoff_time ?? "09:00").slice(0, 5)}
        pickupTime={String(me?.boarding_pickup_time ?? "17:00").slice(0, 5)}
      />
      <BackBar href={back.href} label={back.label} />
    </>
  );
}
