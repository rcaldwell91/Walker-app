"use client";

import { useActionState } from "react";
import { addTimeOff } from "./actions";
import { Button, ErrorText, Field, Input } from "@/components/ui";

export function TimeOffForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState(addTimeOff, undefined);
  return (
    <form noValidate action={action} className="flex flex-col gap-3" key={state?.done ?? 0}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="First day off">
          <Input type="date" name="starts_on" min={today} required />
        </Field>
        <Field label="Last day off">
          <Input type="date" name="ends_on" min={today} />
        </Field>
      </div>
      <Input name="note" placeholder="Note (optional), e.g. Family trip" maxLength={200} aria-label="Note" />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Add time off"}
      </Button>
      <ErrorText>{state?.error}</ErrorText>
    </form>
  );
}
