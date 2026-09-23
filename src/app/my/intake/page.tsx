import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { PageTitle } from "@/components/ui";
import { IntakeForm } from "./intake-form";

export default async function IntakePage() {
  const { supabase, user } = await requireRole("client");
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, phone, address_line, city, emergency_contact, home_access_notes, dogs(*), walker:walkers!clients_walker_id_fkey(business_name)")
    .eq("profile_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!client) redirect("/my");

  return (
    <>
      <PageTitle sub="Tell your walker what they need to know. Takes a few minutes; you can change it later.">
        About you and your dog
      </PageTitle>
      <IntakeForm client={client} dogs={client.dogs ?? []} />
    </>
  );
}
