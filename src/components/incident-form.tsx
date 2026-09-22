"use client";

import { useActionState } from "react";
import { fileIncident } from "@/app/(walker)/walk/actions";
import { Button, ErrorText, Field, Select } from "@/components/ui";
import { VoiceInput } from "@/components/voice-input";

export function IncidentForm({ walkId, dogs }: { walkId: string | null; dogs: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(fileIncident.bind(null, walkId), undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Dog">
        <Select name="dog_id" defaultValue={dogs.length === 1 ? dogs[0].id : ""}>
          <option value="">Not about one dog</option>
          {dogs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="How serious">
        <div className="grid grid-cols-3 gap-2">
          {(["minor", "moderate", "serious"] as const).map((s) => (
            <label key={s} className="cursor-pointer">
              <input type="radio" name="severity" value={s} defaultChecked={s === "minor"} className="peer sr-only" />
              <span className="block rounded-xl border border-border bg-card py-3 text-center text-sm capitalize peer-checked:border-accent peer-checked:bg-accent/10">
                {s}
              </span>
            </label>
          ))}
        </div>
      </Field>
      <Field label="What happened">
        <VoiceInput name="what_happened" rows={4} placeholder="Tap the mic and say what happened." autoFocus />
      </Field>
      <Field label="What you did about it">
        <VoiceInput name="action_taken" rows={2} />
      </Field>
      <ErrorText>{state?.error}</ErrorText>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save report"}
      </Button>
    </form>
  );
}
