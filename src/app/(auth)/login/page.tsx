"use client";

import { Suspense, useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { login } from "../actions";
import { Button, Field, FormStatus, Input, PageTitle } from "@/components/ui";
import { PasswordInput } from "@/components/password";

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <PageTitle sub="Welcome back.">Log in</PageTitle>
      {params.get("error") === "link" ? (
        <p className="mb-4 rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">That link has expired or was already used. Log in, or ask for a new one.</p>
      ) : params.get("confirm") ? (
        <p className="mb-4 rounded-xl bg-accent/10 px-3 py-2 text-sm">
          Check your email to confirm your account, then log in.
        </p>
      ) : null}
      <form action={action} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="next" value={params.get("next") ?? ""} />
        <Field label="Email">
          <Input name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} data-email />
        </Field>
        <Field label="Password">
          <PasswordInput name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} data-password />
        </Field>
        <Link href="/forgot" className="-mt-2 self-start py-2 text-sm text-accent underline">
          Forgot password?
        </Link>
        <Button type="submit" disabled={pending} className="h-12" data-submit>
          {pending ? "Logging in…" : "Log in"}
        </Button>
        <FormStatus error={state?.error} />
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
