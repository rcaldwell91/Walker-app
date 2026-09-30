"use client";

import { useActionState, useEffect, useState } from "react";
import { assignHomework } from "../actions";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";
import { VoiceInput } from "@/components/voice-input";
import { FormDraft } from "@/components/form-draft";

export function HomeworkForm({ dogId }: { dogId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(assignHomework.bind(null, dogId), undefined);
  // Assigned: close the form so a second tap can't assign it twice.
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state?.ok, state?.at]);
  if (!open) {
    return (
      <>
        <Button type="button" variant="secondary" className="w-full" onClick={() => setOpen(true)}>
          + Give homework
        </Button>
        <p className="mt-1 min-h-5 text-sm text-accent" role="status">
          {state?.ok ? "Homework assigned." : ""}
        </p>
      </>
    );
  }
  return (
    <form action={action}>
      <FormDraft id={`homework:${dogId}`} done={state?.at} />
      <Card className="flex flex-col gap-3">
        <Field label="Work on">
          <Input name="title" placeholder="e.g. Wait and stay at the door" autoFocus required />
        </Field>
        <Field label="How">
          <VoiceInput name="instructions" rows={3} placeholder="A sentence or two the owner can follow." />
        </Field>
        <Field label="Check back by">
          <Input name="due_at" type="date" />
        </Field>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={pending}>
            {pending ? "Assigning…" : "Assign"}
          </Button>
        </div>
        <ErrorText>{state?.error}</ErrorText>
      </Card>
    </form>
  );
}
