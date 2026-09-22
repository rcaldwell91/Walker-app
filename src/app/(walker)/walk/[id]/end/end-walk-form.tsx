"use client";

import { useActionState } from "react";
import { endWalk } from "../../actions";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";
import { VoiceInput } from "@/components/voice-input";

export function EndWalkForm({
  walkId,
  dogs,
}: {
  walkId: string;
  dogs: { id: string; name: string; working_on: string; progress_summary: string }[];
}) {
  const [state, action, pending] = useActionState(endWalk.bind(null, walkId), undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      {dogs.map((d) => (
        <Card key={d.id} className="flex flex-col gap-3">
          <p className="font-medium">{d.name}</p>
          <Field label="Working on">
            <Input name={`working_on[${d.id}]`} defaultValue={d.working_on} placeholder="e.g. wait and stay, loose leash" />
          </Field>
          <Field label="Where they're at">
            <VoiceInput name={`progress[${d.id}]`} defaultValue={d.progress_summary} rows={2} placeholder="Short. This is what you'll see at next pickup." />
          </Field>
        </Card>
      ))}
      <Field label="Walk summary for the owners" hint="Optional. Goes on the walk report.">
        <VoiceInput name="summary" rows={3} />
      </Field>
      <ErrorText>{state?.error}</ErrorText>
      <Button type="submit" disabled={pending} className="h-14 text-lg">
        {pending ? "Saving…" : "Finish walk"}
      </Button>
    </form>
  );
}
