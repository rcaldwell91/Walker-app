"use client";

import { useActionState, useRef, useState } from "react";
import { setNewPassword } from "@/app/(auth)/actions";
import { Field } from "./ui";
import { PasswordInput, PasswordSubmit, useBreachWarning } from "./password";

/** New password, used by the reset link and by "Change password". `back` is where to go once it's saved. */
export function ChangePasswordForm({ back }: { back?: string }) {
  const [state, action, pending] = useActionState(setNewPassword, undefined);
  const breach = useBreachWarning(state);
  const [password, setPassword] = useState("");
  const pw = useRef<HTMLInputElement>(null);
  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      {back ? <input type="hidden" name="back" value={back} /> : null}
      <Field label="New password" hint="At least 8 characters. Tap the eye to see what you typed.">
        <PasswordInput
          ref={pw}
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => {
            breach.clear();
            setPassword(e.target.value);
          }}
          data-password
        />
      </Field>
      <PasswordSubmit
        warn={breach.warn}
        pending={pending}
        label="Save password"
        pendingLabel="Saving…"
        error={state?.error}
        onPickAnother={() => {
          breach.clear();
          setPassword("");
          pw.current?.focus();
        }}
      />
    </form>
  );
}
