import { requireRole } from "@/lib/session";
import { PageTitle } from "@/components/ui";
import { BackBar } from "@/components/back-bar";
import { SettingsForm } from "./settings-form";

/** Choices that depend on how each walker runs their business. */
export default async function SettingsPage() {
  const { supabase, user } = await requireRole("walker", "operator");
  const { data: w } = await supabase
    .from("walkers")
    .select("boarding_dropoff_time, boarding_pickup_time, boarding_early_pickup, untagged_photos_to_all, payment_methods, tip_presets, eta_mph")
    .eq("id", user.id)
    .single();
  return (
    <>
      <PageTitle sub="How you run things. Each change saves right away.">Business settings</PageTitle>
      <SettingsForm
        initial={{
          dropoff: String(w?.boarding_dropoff_time ?? "09:00").slice(0, 5),
          pickup: String(w?.boarding_pickup_time ?? "17:00").slice(0, 5),
          earlyPickup: (w?.boarding_early_pickup as "booked" | "actual") ?? "booked",
          untaggedToAll: w?.untagged_photos_to_all ?? true,
          methods: (w?.payment_methods as string[]) ?? ["cash", "venmo", "zelle", "check"],
          tips: (w?.tip_presets as number[]) ?? [5, 10, 20],
          etaMph: w?.eta_mph ?? 25,
        }}
      />
      <BackBar href="/more" label="More" />
    </>
  );
}
