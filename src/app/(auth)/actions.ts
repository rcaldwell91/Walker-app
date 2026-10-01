"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { homeFor, type Role } from "@/lib/session";
import { friendly } from "@/lib/errors";
import { cleanEmail, cleanPhone, handleCandidate, handleFromName, looksLikeEmail } from "@/lib/input";
import { isPwnedPassword } from "@/lib/pwned";
import { rememberPasswordCheck } from "@/lib/password-notice";

export type AuthState = { error?: string; breached?: boolean } | undefined;

const EMAIL_LINE = "Check the email. It should look like name@example.com";

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  const email = cleanEmail(String(form.get("email") ?? ""));
  const password = String(form.get("password") ?? "");
  if (!email) return { error: "Type the email you log in with" };
  if (!looksLikeEmail(email)) return { error: EMAIL_LINE };
  if (!password) return { error: "Type your password" };
  // The breach check runs alongside sign-in; it never holds sign-in up for long
  // and never stops it. If it's slow, it finishes after the page has moved on.
  const check = isPwnedPassword(password);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Email or password didn't match." };
  const userId = data.user.id;
  const quick = await Promise.race([check, new Promise<"slow">((r) => setTimeout(() => r("slow"), 800))]);
  if (quick === "slow") after(async () => rememberPasswordCheck(userId, await check).catch(() => {}));
  else await rememberPasswordCheck(userId, quick).catch(() => {});

  const next = String(form.get("next") ?? "");
  if (next && next.startsWith("/") && !next.startsWith("//")) redirect(next);
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  redirect(homeFor(profile?.role as Role | undefined));
}

/**
 * New walker. Nobody picks a handle at signup: it's made from their name
 * ("Mary Jo" → mary-jo, then mary-jo-2 if that's taken) and they can change it
 * later in Profile & account ("Your public page link").
 */
export async function signupWalker(_: AuthState, form: FormData): Promise<AuthState> {
  const full_name = String(form.get("full_name") ?? "").trim().replace(/\s+/g, " ");
  const business_name = String(form.get("business_name") ?? "").trim();
  const email = cleanEmail(String(form.get("email") ?? ""));
  const phone = cleanPhone(String(form.get("phone") ?? ""));
  const password = String(form.get("password") ?? "");
  if (full_name.length < 2) return { error: "Type your name" };
  if (!email) return { error: "Type your email. You'll log in with it" };
  if (!looksLikeEmail(email)) return { error: EMAIL_LINE };
  if (!phone.phone && !phone.error) return { error: "Type your phone number. Your clients and backup walkers use it to reach you" };
  if (phone.error) return { error: phone.error };
  if (password.length < 8) return { error: "Password needs at least 8 characters" };
  if (form.has("password_confirm") && form.get("password_confirm") !== password) return { error: "These don't match. Type the same password in both boxes." };
  const warnedAlready = form.get("breach_ok") === "1";
  if (!warnedAlready && (await isPwnedPassword(password)) === true) return { breached: true };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { role: "walker", full_name, phone: phone.phone },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });
  if (error) return { error: /already/i.test(error.message) ? "There's already an account with that email. Log in instead." : friendly(error, "Couldn't sign you up. Try again.") };
  if (!data.user) return { error: "Couldn't sign you up. Try again." };

  // The walkers row is created with the service role: the user may not have a
  // session yet if email confirmation is on.
  const admin = createServiceClient();
  const { error: wErr } = await insertWalkerWithFreeHandle(admin, data.user.id, full_name, business_name);
  if (wErr) {
    // Don't leave a login with no walker behind; the profile row cascades with it.
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: friendly(wErr, "Couldn't sign you up. Try again.") };
  }
  if (warnedAlready) await rememberPasswordCheck(data.user.id, true, true).catch(() => {});

  if (data.session) redirect("/home");
  redirect("/login?confirm=1");
}

/** First free handle from the name: base, base-2, base-3, … (retries if two signups race for one). */
async function insertWalkerWithFreeHandle(admin: ReturnType<typeof createServiceClient>, id: string, name: string, business_name: string) {
  const base = handleFromName(name);
  const { data: taken } = await admin.from("walkers").select("handle").like("handle", `${base.slice(0, 26)}%`);
  const used = new Set((taken ?? []).map((t) => t.handle));
  let n = 1;
  for (let tries = 0; tries < 8; tries++) {
    while (used.has(handleCandidate(base, n))) n++;
    const handle = handleCandidate(base, n);
    const { error } = await admin.from("walkers").insert({ id, handle, business_name });
    if (!error || error.code !== "23505") return { error };
    used.add(handle);
  }
  return { error: { code: "P0001", message: "Couldn't sign you up. Try again." } };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

/** "Dismiss" on the after-sign-in notice: it isn't shown again for this password. */
export async function dismissPasswordNotice(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Log in again." };
  const { error } = await createServiceClient()
    .from("password_notices")
    .update({ state: "dismissed", updated_at: new Date().toISOString() })
    .eq("user_id", auth.user.id);
  return error ? { error: friendly(error) } : {};
}

/** "Forgot password?": Supabase emails a reset link (a real email, sent by the login service). */
export type ResetState = { error?: string; sent?: boolean } | undefined;
export async function requestReset(_: ResetState, form: FormData): Promise<ResetState> {
  const email = cleanEmail(String(form.get("email") ?? ""));
  if (!email) return { error: "Type the email you log in with" };
  if (!looksLikeEmail(email)) return { error: EMAIL_LINE };
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
  if (form.has("password_confirm") && form.get("password_confirm") !== password) return { error: "These don't match. Type the same password in both boxes." };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "That link has expired. Ask for a new one." };
  const warnedAlready = form.get("breach_ok") === "1";
  if (!warnedAlready && (await isPwnedPassword(password)) === true) return { breached: true };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: /different|same/i.test(error.message) ? "That's already your password. Type a different one." : "Couldn't change it. Try again." };
  // A new password starts fresh: no notice, unless they chose to keep a breached one (they've just been told).
  await rememberPasswordCheck(auth.user.id, false, warnedAlready).catch(() => {});
  const back = String(form.get("back") ?? "");
  if (back.startsWith("/") && !back.startsWith("//")) redirect(`${back}${back.includes("?") ? "&" : "?"}password=changed`);
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  redirect(homeFor(profile?.role as Role | undefined));
}
