"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { login } from "../actions";
import { Button, ErrorText, Field, Input, PageTitle } from "@/components/ui";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <PageTitle sub="Welcome back.">Log in</PageTitle>
      {params.get("confirm") ? (
        <p className="mb-4 rounded-xl bg-accent/10 px-3 py-2 text-sm">
          Check your email to confirm your account, then log in.
        </p>
      ) : null}
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={params.get("next") ?? ""} />
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <ErrorText>{state?.error}</ErrorText>
        <Button type="submit" disabled={pending}>
          {pending ? "Logging in…" : "Log in"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted">
        New walker?{" "}
        <Link href="/signup" className="text-accent underline">
          Create an account
        </Link>
      </p>
    </main>
  );
}
