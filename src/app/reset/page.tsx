"use client";

import { useActionState } from "react";
import { setNewPassword } from "@/app/(auth)/actions";
import { Button, Field, FormStatus, Input, PageTitle } from "@/components/ui";

/** Opened from the reset email (the link signs the person in first). */
export default function ResetPage() {
  const [state, action, pending] = useActionState(setNewPassword, undefined);
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <PageTitle>Set a new password</PageTitle>
      <form action={action} className="flex flex-col gap-4">
        <Field label="New password" hint="At least 8 characters.">
          <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save password"}
        </Button>
        <FormStatus error={state?.error} />
      </form>
    </main>
  );
}
