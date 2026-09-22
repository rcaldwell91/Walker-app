"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { AuthState } from "@/app/(auth)/actions";

const schema = z.object({
  token: z.string().min(10),
  full_name: z.string().min(2, "Enter your name"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password needs at least 8 characters"),
});

export async function redeemInvite(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const admin = createServiceClient();
  const { data: invite } = await admin
    .from("client_invites")
    .select("token, client_id, walker_id, expires_at, redeemed_at")
    .eq("token", d.token)
    .maybeSingle();
  if (!invite || invite.redeemed_at || new Date(invite.expires_at) < new Date()) {
    return { error: "This invite link isn't valid anymore." };
  }

  // Create the login (auto-confirmed: they came from a link the walker sent them).
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: d.email,
    password: d.password,
    email_confirm: true,
    user_metadata: { role: "client", full_name: d.full_name },
  });
  let userId = created?.user?.id;

  if (cErr) {
    // Existing account (e.g. a client of two walkers). Let them sign in with it.
    if (!/already/i.test(cErr.message)) return { error: cErr.message };
    const supabase = await createClient();
    const { data: signedIn, error: sErr } = await supabase.auth.signInWithPassword({
      email: d.email,
      password: d.password,
    });
    if (sErr || !signedIn.user) {
      return { error: "An account with that email exists. Enter that account's password." };
    }
    userId = signedIn.user.id;
  } else {
    const supabase = await createClient();
    await supabase.auth.signInWithPassword({ email: d.email, password: d.password });
  }

  await admin
    .from("clients")
    .update({ profile_id: userId, email: d.email, status: "active", name: d.full_name })
    .eq("id", invite.client_id);
  await admin.from("client_invites").update({ redeemed_at: new Date().toISOString() }).eq("token", d.token);

  redirect(`/my/intake`);
}
