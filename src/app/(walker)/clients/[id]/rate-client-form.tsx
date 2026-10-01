"use client";

import { useActionState } from "react";
import { rateClient } from "../actions";
import { Button, Field, Input, FormStatus } from "@/components/ui";
import { ScoreInput } from "@/components/score-input";

export function RateClientForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(rateClient.bind(null, clientId), undefined);
  return (
    <form noValidate action={action} className="flex flex-col gap-3" key={state?.done ?? 0}>
      <ScoreInput name="score" label="How are they to work with?" low="Hard" high="Great" />
      <Field label="Private note (optional)">
        <Input name="comment" maxLength={1000} />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save rating"}
      </Button>
      <FormStatus error={state?.error} ok={state?.done && "Saved. Only you can see this."} />
    </form>
  );
}
