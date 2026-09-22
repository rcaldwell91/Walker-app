import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { PageTitle } from "@/components/ui";
import { ClientForm } from "@/components/client-form";
import { updateClientAction } from "../../actions";

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireRole("walker", "operator");
  const { data: client } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  if (!client) notFound();
  return (
    <>
      <PageTitle>Edit {client.name}</PageTitle>
      <ClientForm action={updateClientAction.bind(null, id)} initial={client} />
    </>
  );
}
