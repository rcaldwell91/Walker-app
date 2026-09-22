"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signupWalker } from "../actions";
import { Button, ErrorText, Field, Input, PageTitle } from "@/components/ui";

export default function SignupPage() {
  const [state, action, pending] = useActionState(signupWalker, undefined);
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <PageTitle sub="Set up your walker account. Takes a minute.">Join as a walker</PageTitle>
      <form action={action} className="flex flex-col gap-4">
        <Field label="Your name">
          <Input name="full_name" autoComplete="name" required />
        </Field>
        <Field label="Business name" hint="Optional. Shows on your profile page.">
          <Input name="business_name" />
        </Field>
        <Field label="Handle" hint="Your profile link: /w/your-handle">
          <Input name="handle" pattern="[a-z0-9\-]{3,30}" placeholder="e.g. roberts-walks" required />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Phone">
          <Input name="phone" type="tel" autoComplete="tel" />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        <ErrorText>{state?.error}</ErrorText>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create account"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted">
        Already have one?{" "}
        <Link href="/login" className="text-accent underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
