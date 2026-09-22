"use client";

import { useActionState } from "react";
import { redeemInvite } from "./actions";
import { Button, ErrorText, Field, Input } from "@/components/ui";

export default function JoinForm({
  token,
  defaultEmail,
  defaultName,
}: {
  token: string;
  defaultEmail: string;
  defaultName: string;
}) {
  const [state, action, pending] = useActionState(redeemInvite, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <Field label="Your name">
        <Input name="full_name" defaultValue={defaultName} autoComplete="name" required />
      </Field>
      <Field label="Email">
        <Input name="email" type="email" defaultValue={defaultEmail} autoComplete="email" required />
      </Field>
      <Field label="Choose a password">
        <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <ErrorText>{state?.error}</ErrorText>
      <Button type="submit" disabled={pending}>
        {pending ? "Setting up…" : "Continue"}
      </Button>
    </form>
  );
}
