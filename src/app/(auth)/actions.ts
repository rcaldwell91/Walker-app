"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { homeFor, type Role } from "@/lib/session";
import { friendly } from "@/lib/errors";

export type AuthState = { error?: string } | undefined;

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { error: "Email or password didn't match." };
  const next = parsed.data.next;
  if (next && next.startsWith("/") && !next.startsWith("//")) redirect(next);
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  redirect(homeFor(profile?.role as Role | undefined));
}

const signupSchema = z.object({
  full_name: z.string().min(2, "Enter your name"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().optional(),
  password: z.string().min(8, "Password needs at least 8 characters"),
  handle: z
    .string()
    .regex(/^[a-z0-9-]{3,30}$/, "Handle: 3–30 lowercase letters, numbers, or dashes"),
  business_name: z.string().optional(),
});

export async function signupWalker(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: d.email,
    password: d.password,
    options: {
      data: { role: "walker", full_name: d.full_name, phone: d.phone ?? null },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });
  if (error) return { error: /already/i.test(error.message) ? "There's already an account with that email. Log in instead." : friendly(error, "Couldn't sign you up. Try again.") };
  if (!data.user) return { error: "Couldn't sign you up. Try again." };

  // The walkers row is created with the service role: the user may not have a
  // session yet if email confirmation is on.
  const admin = createServiceClient();
  const { error: wErr } = await admin.from("walkers").insert({
    id: data.user.id,
    handle: d.handle,
    business_name: d.business_name ?? "",
  });
  if (wErr) {
    // Don't leave a login with no walker behind; the profile row cascades with it.
    await admin.auth.admin.deleteUser(data.user.id);
    return {
      error: wErr.code === "23505" ? "That handle is taken. Try another." : friendly(wErr),
    };
  }

  if (data.session) redirect("/home");
  redirect("/login?confirm=1");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

/** "Forgot password?": Supabase emails a reset link (a real email, sent by the login service). */
export type ResetState = { error?: string; sent?: boolean } | undefined;
export async function requestReset(_: ResetState, form: FormData): Promise<ResetState> {
  const email = String(form.get("email") ?? "").trim();
  if (!z.string().email().safeParse(email).success) return { error: "Enter the email you log in with" };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset`,
  });
  if (error) return { error: /rate|seconds/i.test(error.message) ? "Wait a minute, then try again." : "Couldn't send the link. Try again." };
  return { sent: true };
}

/** Set a new password (the reset link has signed the person in). */
export async function setNewPassword(_: AuthState, form: FormData): Promise<AuthState> {
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "Password needs at least 8 characters" };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "That link has expired. Ask for a new one." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: /different|same/i.test(error.message) ? "Pick a password you haven't used here before." : "Couldn't change it. Try again." };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  redirect(homeFor(profile?.role as Role | undefined));
}
