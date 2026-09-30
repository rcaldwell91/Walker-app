"use client";

import { useActionState, useState } from "react";
import { assignHomework } from "../actions";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";
import { VoiceInput } from "@/components/voice-input";

export function HomeworkForm({ dogId }: { dogId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(assignHomework.bind(null, dogId), undefined);
  if (!open) {
    return (
      <Button type="button" variant="secondary" className="w-full" onClick={() => setOpen(true)}>
        + Give homework
      </Button>
    );
  }
  return (
    <form action={action}>
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
        <ErrorText>{state?.error}</ErrorText>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={pending}>
            Assign
          </Button>
        </div>
      </Card>
    </form>
  );
}
