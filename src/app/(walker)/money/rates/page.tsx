import { requireRole } from "@/lib/session";
import { PageTitle, SectionTitle } from "@/components/ui";
import { BackBar } from "@/components/back-bar";
import { RatesForm } from "./rates-form";
import { BoardingRatesForm } from "./boarding-rates-form";

export default async function RatesPage() {
  const { supabase, user } = await requireRole("walker", "operator");
  const [{ data: types }, { data: mine }, { data: me }] = await Promise.all([
    supabase.from("service_types").select("id, name, default_duration_min, walker_id, sort_order").order("sort_order"),
    supabase.from("walker_services").select("service_type_id, rate_cents, duration_min, enabled").eq("walker_id", user.id),
    supabase.from("walkers").select("boarding_night_cents, boarding_extra_pet_cents").eq("id", user.id).single(),
  ]);
  const byType = new Map((mine ?? []).map((s) => [s.service_type_id, s]));
  const services = (types ?? [])
    .filter((t) => t.walker_id === null || t.walker_id === user.id)
    .map((t) => {
      const s = byType.get(t.id);
      return {
        id: t.id,
        name: t.name,
        defaultDuration: t.default_duration_min,
        enabled: s?.enabled ?? false,
        rate: s ? (s.rate_cents / 100).toFixed(2).replace(/\.00$/, "") : "",
        duration: s?.duration_min ?? null,
      };
    });
  return (
    <>
      <PageTitle sub="What you charge. Finished walks and stays bill at these rates.">My rates</PageTitle>
      <SectionTitle>Walks and visits</SectionTitle>
      <RatesForm services={services} />
      <SectionTitle>Boarding</SectionTitle>
      <BoardingRatesForm night={me?.boarding_night_cents ?? null} extra={me?.boarding_extra_pet_cents ?? null} />
      <BackBar href="/money" label="Money" />
    </>
  );
}
