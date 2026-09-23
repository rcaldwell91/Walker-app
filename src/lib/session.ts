import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "operator" | "walker" | "client";

export async function getSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
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
}

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
