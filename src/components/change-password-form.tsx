"use client";

import { useActionState } from "react";
import { setNewPassword } from "@/app/(auth)/actions";
import { PasswordSubmit, useNewPassword } from "./password";

/** New password, used by the reset link and by "Change password". `back` is where to go once it's saved. */
export function ChangePasswordForm({ back }: { back?: string }) {
  const [state, action, pending] = useActionState(setNewPassword, undefined);
  const pw = useNewPassword(state);
  return (
    <form action={action} onSubmit={pw.onSubmit} noValidate className="flex flex-col gap-4">
      {back ? <input type="hidden" name="back" value={back} /> : null}
      {pw.fields({ label: "New password", hint: "At least 8 characters. Tap the eye to see what you typed." })}
      <PasswordSubmit warn={pw.warn} mismatch={pw.mismatch} pending={pending} label="Save password" pendingLabel="Saving…" error={state?.error} onPickAnother={pw.pickAnother} />
    </form>
  );
}
