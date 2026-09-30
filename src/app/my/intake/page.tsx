import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { PageTitle } from "@/components/ui";
import { IntakeForm } from "./intake-form";
import { BackBar } from "@/components/back-bar";

export default async function IntakePage() {
  const { supabase, user } = await requireRole("client");
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, phone, address_line, city, emergency_contact, home_access_notes, boarding_bringing, dogs(*), walker:walkers!clients_walker_id_fkey(business_name)")
    .eq("profile_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!client) redirect("/my");
  const { count: stays } = await supabase.from("boarding_stays").select("id", { count: "exact", head: true }).eq("client_id", client.id).eq("status", "booked");

  return (
    <>
      <PageTitle sub="Tell your walker what they need to know. Takes a few minutes; you can change it later.">
        About you and your pets
      </PageTitle>
      <IntakeForm client={client} dogs={client.dogs ?? []} boardingOpen={!!stays} />
      <BackBar href={"/my/more"} label={"More"} />
    </>
  );
}
