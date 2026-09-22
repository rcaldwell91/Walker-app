"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";

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
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { error: "Email or password didn't match." };
  redirect(parsed.data.next && parsed.data.next.startsWith("/") ? parsed.data.next : "/home");
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
  if (error) return { error: error.message };
  if (!data.user) return { error: "Signup failed. Try again." };

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
      error: wErr.code === "23505" ? "That handle is taken. Try another." : wErr.message,
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
