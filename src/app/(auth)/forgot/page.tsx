"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestReset } from "../actions";
import { Button, Field, FormStatus, Input, PageTitle } from "@/components/ui";

export default function ForgotPage() {
  const [state, action, pending] = useActionState(requestReset, undefined);
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <PageTitle sub="We'll email you a link to set a new one.">Forgot your password?</PageTitle>
      <form action={action} className="flex flex-col gap-4">
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Email me a link"}
        </Button>
        <FormStatus error={state?.error} ok={state?.sent && "If that email has an account, the link is on its way. Check your inbox."} />
      </form>
      <p className="mt-6 text-sm">
        <Link href="/login" className="text-accent underline">
          Back to log in
        </Link>
      </p>
    </main>
  );
}
