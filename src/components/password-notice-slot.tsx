import type { SupabaseClient } from "@supabase/supabase-js";
import { PasswordNoticeCard } from "./password-notice";

/** The after-sign-in breached-password notice, if this person has one waiting (0026). */
export async function PasswordNotice({ supabase, userId, changeHref }: { supabase: SupabaseClient; userId: string; changeHref: string }) {
  const { data } = await supabase.from("password_notices").select("state").eq("user_id", userId).maybeSingle();
  if (data?.state !== "show") return null;
  return <PasswordNoticeCard changeHref={changeHref} />;
}
