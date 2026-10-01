"use client";

import { useActionState, useState } from "react";
import { updateDog } from "../actions";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";
import { VoiceInput } from "@/components/voice-input";
import { fmtPhone } from "@/lib/input";

type Dog = {
  id: string;
  name: string;
  breed: string | null;
  working_on: string;
  progress_summary: string;
  quirks: string | null;
  medications: string | null;
  allergies: string | null;
  vet_name: string | null;
  vet_phone: string | null;
};

export function DogEditForm({ dog }: { dog: Dog }) {
  const [state, action, pending] = useActionState(updateDog.bind(null, dog.id), undefined);
  const [more, setMore] = useState(false);
  // "Saved" is about what's on screen: any change after saving takes it away.
  const [editedAt, setEditedAt] = useState(0);
  const savedNow = !!state?.ok && !pending && (state.at ?? 0) > editedAt;
  return (
    <form noValidate action={action} onChange={() => setEditedAt(Date.now())}>
      <Card className="flex flex-col gap-3">
        <Field label="Working on">
          <Input name="working_on" defaultValue={dog.working_on} placeholder="e.g. wait and stay" />
        </Field>
        {dog.quirks ? <p className="text-sm text-warn">{dog.quirks}</p> : null}
        {more ? (
          <>
            <Field label="Name"><Input name="name" defaultValue={dog.name} /></Field>
            <Field label="Breed"><Input name="breed" defaultValue={dog.breed ?? ""} /></Field>
            <Field label="Things to know"><VoiceInput name="quirks" defaultValue={dog.quirks ?? ""} rows={2} /></Field>
            <Field label="Medications"><Input name="medications" defaultValue={dog.medications ?? ""} /></Field>
            <Field label="Allergies"><Input name="allergies" defaultValue={dog.allergies ?? ""} /></Field>
            <Field label="Vet"><Input name="vet_name" defaultValue={dog.vet_name ?? ""} /></Field>
            <Field label="Vet phone"><Input name="vet_phone" type="tel" defaultValue={fmtPhone(dog.vet_phone)} /></Field>
          </>
        ) : (
          <button type="button" className="text-left text-sm text-accent" onClick={() => setMore(true)}>
            Edit details…
          </button>
        )}
        <Button type="submit" variant="secondary" disabled={pending}>
          {savedNow ? "Saved" : pending ? "Saving…" : "Save"}
        </Button>
        <ErrorText>{state?.error}</ErrorText>
      </Card>
    </form>
  );
}
