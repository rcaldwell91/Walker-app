"use client";

import { useActionState } from "react";
import { saveStayIntake } from "../actions";
import { Button, Card, ErrorText } from "@/components/ui";
import { BoardingClientFields, BoardingPetFields } from "@/components/boarding-intake";
import type { PetBoarding } from "@/lib/boarding";
import { FormDraft } from "@/components/form-draft";

/** The walker filling in or correcting the boarding answers for this stay's pets. */
export function StayIntakeForm({
  stayId,
  pets,
  emergency,
  bringing,
}: {
  stayId: string;
  pets: { id: string; name: string; boarding: PetBoarding }[];
  emergency: string | null;
  bringing: string | null;
}) {
  const [state, action, pending] = useActionState(saveStayIntake.bind(null, stayId), undefined);
  return (
    <form noValidate action={action} className="flex flex-col gap-3" data-stay-intake-form>
      <FormDraft id={`stay-intake:${stayId}`} done={state?.saved} />
      {pets.map((p) => (
        <Card key={p.id} className="flex flex-col gap-3">
          <p className="font-medium">{p.name}</p>
          <BoardingPetFields pet={p.name} boarding={p.boarding} nameFor={(k) => `b[${p.id}][${k}]`} />
        </Card>
      ))}
      <Card className="flex flex-col gap-3">
        <BoardingClientFields emergency={emergency} bringing={bringing} />
      </Card>
      <ErrorText>{state?.error}</ErrorText>
      <p className="min-h-5 text-sm text-accent" role="status">
        {state?.saved ? "Saved." : ""}
      </p>
      <Button type="submit" disabled={pending} data-save-intake>
        {pending ? "Saving…" : "Save boarding details"}
      </Button>
    </form>
  );
}
