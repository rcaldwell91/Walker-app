"use client";

import { useActionState, useState } from "react";
import { redeemInvite } from "./actions";
import { Field, Input } from "@/components/ui";
import { PasswordSubmit, useNewPassword } from "@/components/password";

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
  const pw = useNewPassword(state);
  const [v, setV] = useState({ full_name: defaultName, email: defaultEmail });
  return (
    <form action={action} onSubmit={pw.onSubmit} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <Field label="Your name">
        <Input name="full_name" value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} autoComplete="name" autoCapitalize="words" />
      </Field>
      <Field label="Email" hint="You'll log in with this.">
        <Input name="email" type="email" inputMode="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} autoComplete="email" autoCapitalize="none" />
      </Field>
      {pw.fields({ label: "Choose a password", hint: "At least 8 characters. If you already have a login here, use that password." })}
      <PasswordSubmit
        warn={pw.warn}
        mismatch={pw.mismatch}
        pending={pending}
        label="Continue"
        pendingLabel="Setting up…"
        error={state?.error}
        onPickAnother={pw.pickAnother}
      />
    </form>
  );
}
