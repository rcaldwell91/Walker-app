import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "operator" | "walker" | "client";

/**
 * Who is signed in, once per page load. The layout, the page and anything else
 * on the page share this one answer (React cache), instead of each asking again.
 * The sign-in token is checked here with the project's public key (getClaims),
 * so no trip to the login service is needed; the middleware has already
 * refreshed it if it was about to expire.
 */
/** The signed-in person from the token alone (no database call), once per page load. */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { supabase, user: { id: claims.sub, email: (claims.email as string | undefined) ?? "" } };
});

export const getSession = cache(async () => {
  const signedIn = await getUser();
  if (!signedIn) return null;
  const { supabase, user } = signedIn;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, full_name, phone, avatar_url, notify_off, app_installed_at, install_guide_dismissed_at")
    .eq("id", user.id)
    .single();
  return {
    supabase,
    user,
    profile: profile as {
      id: string;
      role: Role;
      full_name: string;
      phone: string | null;
      avatar_url: string | null;
      notify_off: string[];
      app_installed_at: string | null;
      install_guide_dismissed_at: string | null;
    } | null,
  };
});

export async function requireRole(...roles: Role[]) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!s.profile || !roles.includes(s.profile.role)) redirect(homeFor(s.profile?.role));
  return s;
}

export function homeFor(role?: Role) {
  if (role === "client") return "/my";
  if (role === "operator") return "/admin";
  return "/home";
}
