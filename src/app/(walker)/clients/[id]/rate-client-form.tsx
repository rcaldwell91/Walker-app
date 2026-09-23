"use client";

import { useActionState } from "react";
import { rateClient } from "../actions";
import { Button, ErrorText, Field, Input } from "@/components/ui";
import { ScoreInput } from "@/components/score-input";

export function RateClientForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(rateClient.bind(null, clientId), undefined);
  return (
    <form action={action} className="flex flex-col gap-3" key={state?.done ?? 0}>
      <ScoreInput name="score" label="How are they to work with?" low="Hard" high="Great" />
      <Field label="Private note (optional)">
        <Input name="comment" maxLength={1000} />
      </Field>
      <ErrorText>{state?.error}</ErrorText>
      {state?.done ? <p className="text-sm text-accent" role="status">Saved. Only you can see this.</p> : null}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save rating"}
      </Button>
    </form>
  );
}
