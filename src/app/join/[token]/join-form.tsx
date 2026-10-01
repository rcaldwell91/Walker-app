"use client";

import { useActionState, useRef, useState } from "react";
import { redeemInvite } from "./actions";
import { Field, Input } from "@/components/ui";
import { PasswordInput, PasswordSubmit, useBreachWarning } from "@/components/password";

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
  const breach = useBreachWarning(state);
  const [v, setV] = useState({ full_name: defaultName, email: defaultEmail, password: "" });
  const pw = useRef<HTMLInputElement>(null);
  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <Field label="Your name">
        <Input name="full_name" value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} autoComplete="name" autoCapitalize="words" />
      </Field>
      <Field label="Email" hint="You'll log in with this.">
        <Input name="email" type="email" inputMode="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} autoComplete="email" autoCapitalize="none" />
      </Field>
      <Field label="Choose a password" hint="At least 8 characters. If you already have a login here, use that password.">
        <PasswordInput
          ref={pw}
          name="password"
          value={v.password}
          onChange={(e) => {
            breach.clear();
            setV({ ...v, password: e.target.value });
          }}
          autoComplete="new-password"
          data-password
        />
      </Field>
      <PasswordSubmit
        warn={breach.warn}
        pending={pending}
        label="Continue"
        pendingLabel="Setting up…"
        error={state?.error}
        onPickAnother={() => {
          breach.clear();
          setV({ ...v, password: "" });
          pw.current?.focus();
        }}
      />
    </form>
  );
}
