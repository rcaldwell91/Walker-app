import Link from "next/link";
import { requireRole } from "@/lib/session";
import { Card, Empty, PageTitle } from "@/components/ui";
import { fmtDate, fmtTime } from "@/lib/format";
import { getTimeZone } from "@/lib/timezone";
import { ReplyForm } from "./reply-form";

export default async function MyMessagesPage() {
  const { supabase, user } = await requireRole("client");
  const tz = await getTimeZone();
  const [{ data: messages }, { data: rows }] = await Promise.all([
    supabase
      .from("messages")
      .select("id, body, kind, sent_at, read_at, walk_id, sender_id")
      .order("sent_at", { ascending: false })
      .limit(200),
    supabase
      .from("clients")
      .select("id, status, walker:walkers!clients_walker_id_fkey(id, business_name, profile:profiles(full_name))"),
  ]);

  const walkers = (rows ?? [])
    .filter((r) => r.status === "active")
    .map((r) => {
      const w = Array.isArray(r.walker) ? r.walker[0] : r.walker;
      const p = w && (Array.isArray(w.profile) ? w.profile[0] : w.profile);
      return { id: w?.id as string, name: p?.full_name || w?.business_name || "your walker" };
    })
    .filter((w) => w.id);
  const nameFor = (senderId: string) =>
    senderId === user.id ? "You" : walkers.find((w) => w.id === senderId)?.name ?? "Backup walker";

  // Opening this page reads what was sent to you. The list still marks what was new.
  const unread = (messages ?? []).filter((m) => !m.read_at && m.sender_id !== user.id).map((m) => m.id);
  if (unread.length) await supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", unread);

  return (
    <>
      <PageTitle>Messages</PageTitle>
      {walkers.map((w) => (
        <ReplyForm key={w.id} walkerId={w.id} walkerName={w.name} />
      ))}
      {!messages?.length ? (
        <Empty>Updates from your walker will show up here.</Empty>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Messages">
          {messages.map((m) => {
            const mine = m.sender_id === user.id;
            const isNew = !m.read_at && !mine;
            return (
              <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <Card className={`max-w-[90%] ${mine ? "bg-accent/10" : ""} ${isNew ? "border-accent" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    {isNew ? <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-fg">New</span> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {nameFor(m.sender_id)} · {fmtDate(m.sent_at, tz)} · {fmtTime(m.sent_at, tz)}
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
