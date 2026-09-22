import Link from "next/link";
import { requireRole } from "@/lib/session";
import { Card, Empty, PageTitle } from "@/components/ui";
import { fmtDate, fmtTime } from "@/lib/format";
import { getTimeZone } from "@/lib/timezone";

export default async function MyMessagesPage() {
  const { supabase, user } = await requireRole("client");
  const tz = await getTimeZone();
  const { data: messages } = await supabase
    .from("messages")
    .select("id, body, kind, sent_at, read_at, walk_id")
    .neq("sender_id", user.id)
    .order("sent_at", { ascending: false })
    .limit(200);

  // Opening this page reads them. The list below still marks what was new.
  const unread = (messages ?? []).filter((m) => !m.read_at).map((m) => m.id);
  if (unread.length) await supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", unread);

  return (
    <>
      <PageTitle>Messages</PageTitle>
      {!messages?.length ? (
        <Empty>Updates from your walker will show up here.</Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {messages.map((m) => {
            const isNew = !m.read_at;
            return (
              <li key={m.id}>
                <Card className={isNew ? "border-accent" : ""}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    {isNew ? <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-fg">New</span> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {fmtDate(m.sent_at, tz)} · {fmtTime(m.sent_at, tz)}
                    {m.walk_id ? (
                      <>
                        {" · "}
                        <Link href={`/my/walks/${m.walk_id}`} className="text-accent">
                          See the walk
                        </Link>
                      </>
                    ) : null}
                  </p>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
