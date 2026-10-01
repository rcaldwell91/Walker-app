"use server";

import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { AuthState } from "@/app/(auth)/actions";
import { friendly } from "@/lib/errors";
import { cleanEmail, looksLikeEmail } from "@/lib/input";
import { isPwnedPassword } from "@/lib/pwned";
import { rememberPasswordCheck } from "@/lib/password-notice";

export async function redeemInvite(_: AuthState, form: FormData): Promise<AuthState> {
  const d = {
    token: String(form.get("token") ?? ""),
    full_name: String(form.get("full_name") ?? "").trim().replace(/\s+/g, " "),
    email: cleanEmail(String(form.get("email") ?? "")),
    password: String(form.get("password") ?? ""),
  };
  if (d.full_name.length < 2) return { error: "Type your name" };
  if (!d.email) return { error: "Type your email. You'll log in with it" };
  if (!looksLikeEmail(d.email)) return { error: "Check the email. It should look like name@example.com" };
  if (d.password.length < 8) return { error: "Password needs at least 8 characters" };
  if (form.has("password_confirm") && form.get("password_confirm") !== d.password) return { error: "These don't match. Type the same password in both boxes." };
  const warnedAlready = form.get("breach_ok") === "1";

  const admin = createServiceClient();
  const { data: invite } = await admin
    .from("client_invites")
    .select("token, client_id, walker_id, expires_at, redeemed_at")
    .eq("token", d.token)
    .maybeSingle();
  if (!invite || invite.redeemed_at || new Date(invite.expires_at) < new Date()) {
    return { error: "This invite link isn't valid anymore." };
  }

  // A password that has shown up in a breach: warn before making a new login with it
  // (never refuse). If it's the password of a login they already have, this is
  // a sign-in, so let them in and leave the notice for after.
  let breached: boolean | null = null;
  if (!warnedAlready && (breached = await isPwnedPassword(d.password)) === true) {
    const supabase = await createClient();
    const { error: sErr } = await supabase.auth.signInWithPassword({ email: d.email, password: d.password });
    if (sErr) return { breached: true };
    await supabase.auth.signOut();
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
    if (!/already/i.test(cErr.message)) return { error: friendly(cErr, "Couldn't create your account. Try again.") };
    const supabase = await createClient();
    const { data: signedIn, error: sErr } = await supabase.auth.signInWithPassword({
      email: d.email,
      password: d.password,
    });
    if (sErr || !signedIn.user) {
      return { error: "An account with that email exists. Enter that account's password." };
    }
    userId = signedIn.user.id;
    await rememberPasswordCheck(userId, breached).catch(() => {});
  } else {
    const supabase = await createClient();
    const { error: sErr } = await supabase.auth.signInWithPassword({ email: d.email, password: d.password });
    if (sErr) return { error: "Your account is made. Log in with that email and password." };
    if (warnedAlready && userId) await rememberPasswordCheck(userId, true, true).catch(() => {});
  }

  const { error: linkErr } = await admin
    .from("clients")
    .update({ profile_id: userId, email: d.email, status: "active", name: d.full_name })
    .eq("id", invite.client_id);
  if (linkErr) return { error: friendly(linkErr, "Couldn't connect you to your walker. Tap Join again.") };
  await admin.from("client_invites").update({ redeemed_at: new Date().toISOString() }).eq("token", d.token);

  redirect(`/my/intake`);
}
