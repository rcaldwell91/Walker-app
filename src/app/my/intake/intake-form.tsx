"use client";

import { useActionState, useState } from "react";
import { submitIntake } from "../actions";
import { Button, Card, ErrorText, Field, Input, Select, Textarea } from "@/components/ui";
import { VoiceInput } from "@/components/voice-input";

type Dog = {
  id?: string;
  name: string;
  breed?: string | null;
  sex?: string | null;
  birthdate?: string | null;
  weight_lbs?: number | null;
  vet_name?: string | null;
  vet_phone?: string | null;
  medications?: string | null;
  allergies?: string | null;
  quirks?: string | null;
};

export function IntakeForm({
  client,
  dogs: initialDogs,
}: {
  client: {
    id: string;
    phone: string | null;
    address_line: string | null;
    city: string | null;
    emergency_contact: string | null;
    home_access_notes: string | null;
  };
  dogs: Dog[];
}) {
  const [state, action, pending] = useActionState(submitIntake, undefined);
  const [dogs, setDogs] = useState<Dog[]>(initialDogs.length ? initialDogs : [{ name: "" }]);

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="client_id" value={client.id} />

      <Card className="flex flex-col gap-4">
        <h2 className="font-medium">You</h2>
        <Field label="Phone">
          <Input name="phone" type="tel" defaultValue={client.phone ?? ""} autoComplete="tel" />
        </Field>
        <Field label="Address">
          <Input name="address_line" defaultValue={client.address_line ?? ""} autoComplete="street-address" />
        </Field>
        <Field label="City">
          <Input name="city" defaultValue={client.city ?? ""} />
        </Field>
        <Field label="Emergency contact" hint="Name and number of someone we can call if we can't reach you.">
          <Input name="emergency_contact" defaultValue={client.emergency_contact ?? ""} />
        </Field>
        <Field label="Getting in" hint="Keys, lockbox code, gate, alarm. Only your walker sees this.">
          <Textarea name="home_access_notes" defaultValue={client.home_access_notes ?? ""} />
        </Field>
      </Card>

      {dogs.map((d, i) => (
        <Card key={d.id ?? i} className="flex flex-col gap-4">
          <h2 className="font-medium">{d.name || `Dog ${i + 1}`}</h2>
          {d.id ? <input type="hidden" name={`dog[${i}][id]`} value={d.id} /> : null}
          <Field label="Name">
            <Input name={`dog[${i}][name]`} defaultValue={d.name} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Breed">
              <Input name={`dog[${i}][breed]`} defaultValue={d.breed ?? ""} />
            </Field>
            <Field label="Sex">
              <Select name={`dog[${i}][sex]`} defaultValue={d.sex ?? ""}>
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="male_neutered">Male (neutered)</option>
                <option value="female_spayed">Female (spayed)</option>
              </Select>
            </Field>
            <Field label="Birthday">
              <Input name={`dog[${i}][birthdate]`} type="date" defaultValue={d.birthdate ?? ""} />
            </Field>
            <Field label="Weight (lbs)">
              <Input name={`dog[${i}][weight_lbs]`} type="number" step="0.5" defaultValue={d.weight_lbs ?? ""} />
            </Field>
          </div>
          <Field label="Vet">
            <Input name={`dog[${i}][vet_name]`} defaultValue={d.vet_name ?? ""} placeholder="Clinic name" />
          </Field>
          <Field label="Vet phone">
            <Input name={`dog[${i}][vet_phone]`} type="tel" defaultValue={d.vet_phone ?? ""} />
          </Field>
          <Field label="Medications">
            <Input name={`dog[${i}][medications]`} defaultValue={d.medications ?? ""} />
          </Field>
          <Field label="Allergies">
            <Input name={`dog[${i}][allergies]`} defaultValue={d.allergies ?? ""} />
          </Field>
          <Field label="Anything your walker should know" hint="Reactive to bikes? Pulls? Scared of trucks? Loves squirrels? Tap the mic and just talk.">
            <VoiceInput name={`dog[${i}][quirks]`} defaultValue={d.quirks ?? ""} />
          </Field>
        </Card>
      ))}

      <Button type="button" variant="secondary" onClick={() => setDogs([...dogs, { name: "" }])}>
        + Another dog
      </Button>

      <ErrorText>{state?.error}</ErrorText>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
