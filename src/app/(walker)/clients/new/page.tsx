import { PageTitle } from "@/components/ui";
import { ClientForm } from "@/components/client-form";
import { createClientAction } from "../actions";

export default function NewClientPage() {
  return (
    <>
      <PageTitle sub="You'll get a link to send them next.">Add a client</PageTitle>
      <ClientForm action={createClientAction} showDog submitLabel="Add client" />
    </>
  );
}
