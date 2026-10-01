import { createServiceClient } from "./supabase/server";

/** Remember what the breach check found, for the notice after sign-in. Service role, keyed to the person signing in. */
export async function rememberPasswordCheck(userId: string, breached: boolean | null, warnedAlready = false) {
  const admin = createServiceClient();
  if (warnedAlready) {
    await admin.from("password_notices").upsert({ user_id: userId, state: "dismissed", updated_at: new Date().toISOString() });
  } else if (breached) {
    // Keep a dismissal: the notice is shown once, not at every sign-in.
    await admin.from("password_notices").upsert({ user_id: userId, state: "show", updated_at: new Date().toISOString() }, { onConflict: "user_id", ignoreDuplicates: true });
  } else if (breached === false) {
    await admin.from("password_notices").delete().eq("user_id", userId);
  }
}
