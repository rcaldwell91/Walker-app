"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/(walker)/clients/actions";
import { Button, ErrorText, Field, Input, Textarea } from "@/components/ui";

const COLORS = ["#2f7d5b", "#2b6cb0", "#b3541e", "#8e44ad", "#c0392b", "#d4a017", "#16a085", "#7f8c8d"];

export type ClientFormValues = {
  name?: string;
  email?: string | null;
  phone?: string | null;
  address_line?: string | null;
  city?: string | null;
  home_access_notes?: string | null;
  group_label?: string | null;
  color?: string | null;
};

export function ClientForm({
  action,
  initial = {},
  showDog = false,
  submitLabel = "Save",
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  initial?: ClientFormValues;
  showDog?: boolean;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Client name">
        <Input name="name" defaultValue={initial.name ?? ""} required autoFocus />
      </Field>
      {showDog ? (
        <Field label="Dog's name" hint="You can add more dogs after.">
          <Input name="dog_name" />
        </Field>
      ) : null}
      <Field label="Email" hint="Their invite link goes here if you want us to send it.">
        <Input name="email" type="email" defaultValue={initial.email ?? ""} />
      </Field>
      <Field label="Phone">
        <Input name="phone" type="tel" defaultValue={initial.phone ?? ""} />
      </Field>
      <Field label="Address">
        <Input name="address_line" defaultValue={initial.address_line ?? ""} autoComplete="street-address" />
      </Field>
      <Field label="City">
        <Input name="city" defaultValue={initial.city ?? ""} />
      </Field>
      <Field label="Home access" hint="Keys, gate code, alarm. Only you see this.">
        <Textarea name="home_access_notes" defaultValue={initial.home_access_notes ?? ""} />
      </Field>
      <Field label="Group" hint="e.g. Tuesday group, Northside">
        <Input name="group_label" defaultValue={initial.group_label ?? ""} />
      </Field>
      <Field label="Map color">
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <label key={c} className="cursor-pointer">
              <input
                type="radio"
                name="color"
                value={c}
                defaultChecked={(initial.color ?? COLORS[0]) === c}
                className="peer sr-only"
              />
              <span
                className="block h-9 w-9 rounded-full border-2 border-transparent peer-checked:border-fg"
                style={{ background: c }}
              />
            </label>
          ))}
        </div>
      </Field>
      <ErrorText>{state?.error}</ErrorText>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
