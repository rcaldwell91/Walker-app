"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { signupWalker } from "../actions";
import { Field, Input, PageTitle } from "@/components/ui";
import { PasswordInput, PasswordSubmit, useBreachWarning } from "@/components/password";

export default function SignupPage() {
  const [state, action, pending] = useActionState(signupWalker, undefined);
  const breach = useBreachWarning(state);
  // Kept in state, so a "check your email" line or a password warning never wipes what was typed.
  const [v, setV] = useState({ full_name: "", business_name: "", email: "", phone: "", password: "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const pw = useRef<HTMLInputElement>(null);
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <PageTitle sub="Set up your walker account. Takes a minute.">Join as a walker</PageTitle>
      <form action={action} noValidate className="flex flex-col gap-4">
        <Field label="Your name" hint="Your clients see it. It also starts your public page link, which you can change later.">
          <Input name="full_name" value={v.full_name} onChange={set("full_name")} autoComplete="name" autoCapitalize="words" data-name />
        </Field>
        <Field label="Business name (optional)" hint="If you walk under a business name. It shows at the top of your public page.">
          <Input name="business_name" value={v.business_name} onChange={set("business_name")} autoCapitalize="words" />
        </Field>
        <Field label="Email" hint="You'll log in with this.">
          <Input name="email" type="email" inputMode="email" value={v.email} onChange={set("email")} autoComplete="email" autoCapitalize="none" data-email />
        </Field>
        <Field label="Phone (optional)" hint="Walkers in your backup squad see it, so they can call you about a cover.">
          <Input name="phone" type="tel" value={v.phone} onChange={set("phone")} autoComplete="tel" />
        </Field>
        <Field label="Password" hint="At least 8 characters. Tap the eye to see what you typed.">
          <PasswordInput
            ref={pw}
            name="password"
            value={v.password}
            onChange={(e) => {
              breach.clear();
              set("password")(e);
            }}
            autoComplete="new-password"
            data-password
          />
        </Field>
        <PasswordSubmit
          warn={breach.warn}
          pending={pending}
          label="Create account"
          pendingLabel="Creating…"
          error={state?.error}
          onPickAnother={() => {
            breach.clear();
            setV({ ...v, password: "" });
            pw.current?.focus();
          }}
        />
      </form>
      <p className="text-sm text-muted">
        Already have one?{" "}
        <Link href="/login" className="text-accent underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
