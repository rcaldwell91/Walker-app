import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { markNotificationsRead } from "@/app/push-actions";
import { Card } from "@/components/ui";
import { fmtTime } from "@/lib/format";

/** Unread in-app notifications (the same things that were pushed). */
export async function NotificationsInbox({ supabase, tz }: { supabase: SupabaseClient; tz: string }) {
  const { data } = await supabase
    .from("notifications")
    .select("id, title, body, url, created_at")
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(5);
  if (!data?.length) return null;
  return (
    <Card className="mb-4" data-inbox={data.length}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">Updates</p>
        <form action={markNotificationsRead.bind(null, data.map((n) => n.id))}>
          <button type="submit" className="text-xs text-muted underline">
            Mark all read
          </button>
        </form>
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        {data.map((n) => (
          <li key={n.id}>
            <Link href={n.url} className="block">
              <span className="font-medium">{n.title}</span> <span className="text-muted">· {fmtTime(n.created_at, tz)}</span>
              <span className="block text-muted">{n.body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
