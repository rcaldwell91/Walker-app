import type { ReactNode } from "react";
import { Card, Field, Input, Textarea } from "@/components/ui";
import { PET_BOARDING_FIELDS, type PetBoarding } from "@/lib/boarding";

/**
 * Boarding answers: an extra section on the same pet profile used for walks.
 * `Fields` are the inputs (walker on a stay, client on their intake);
 * `Answers` shows them.
 */

export function BoardingPetFields({ pet, boarding, nameFor }: { pet: string; boarding: PetBoarding; nameFor: (key: string) => string }) {
  return (
    <div className="flex flex-col gap-3" data-boarding-fields={pet}>
      {PET_BOARDING_FIELDS.map((f) => (
        <Field key={f.key} label={f.label}>
          {"long" in f && f.long ? (
            <Textarea name={nameFor(f.key)} defaultValue={boarding[f.key] ?? ""} placeholder={f.placeholder} data-b={f.key} />
          ) : (
            <Input name={nameFor(f.key)} defaultValue={boarding[f.key] ?? ""} placeholder={f.placeholder} data-b={f.key} />
          )}
        </Field>
      ))}
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input type="checkbox" name={nameFor("vet_release")} defaultChecked={!!boarding.vet_release} className="mt-1 h-5 w-5 shrink-0" data-b="vet_release" />
        <span>
          <span className="font-medium">Vet release.</span> If {pet} needs a vet and the owner can&apos;t be reached, the walker may take them to a vet
          and approve treatment.
        </span>
      </label>
    </div>
  );
}

export function BoardingClientFields({ emergency, bringing, emergencyName = "emergency_contact" }: { emergency: string | null; bringing: string | null; emergencyName?: string | null }) {
  return (
    <>
      {emergencyName ? (
        <Field label="Emergency contact" hint="Someone to call if the owner can't be reached.">
          <Input name={emergencyName} defaultValue={emergency ?? ""} data-b="emergency_contact" />
        </Field>
      ) : null}
      <Field label="What they're bringing">
        <Textarea name="boarding_bringing" defaultValue={bringing ?? ""} placeholder="e.g. food for 3 days, bed, blue leash, meds in a zip bag" data-b="bringing" />
      </Field>
    </>
  );
}

export function BoardingAnswers({
  pets,
  emergency,
  bringing,
  empty,
}: {
  pets: { id: string; name: string; boarding: PetBoarding }[];
  emergency: string | null;
  bringing: string | null;
  empty?: ReactNode;
}) {
  const anything = pets.some((p) => PET_BOARDING_FIELDS.some((f) => p.boarding[f.key]) || p.boarding.vet_release) || emergency || bringing;
  if (!anything) return <>{empty ?? null}</>;
  return (
    <div className="flex flex-col gap-2" data-boarding-answers>
      {pets.map((p) => (
        <Card key={p.id} className="text-sm">
          <p className="mb-1 font-medium">{p.name}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {PET_BOARDING_FIELDS.filter((f) => p.boarding[f.key]).map((f) => (
              <Row key={f.key} label={f.label} value={p.boarding[f.key]!} />
            ))}
            <Row label="Vet release" value={p.boarding.vet_release ? "Yes, OK to take to a vet" : "Not given"} />
          </dl>
        </Card>
      ))}
      {emergency || bringing ? (
        <Card className="text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {emergency ? <Row label="Emergency contact" value={emergency} /> : null}
            {bringing ? <Row label="Bringing" value={bringing} /> : null}
          </dl>
        </Card>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </>
  );
}
