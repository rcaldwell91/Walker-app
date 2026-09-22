import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { Empty, PageTitle } from "@/components/ui";
import { fmtDate, fmtTime } from "@/lib/format";
import { getTimeZone } from "@/lib/timezone";
import { MessageForm } from "./message-form";

export default async function ClientMessagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireRole("walker", "operator");
  const tz = await getTimeZone();
  const [{ data: client }, { data: newestFirst }] = await Promise.all([
    supabase.from("clients").select("id, name, status").eq("id", id).maybeSingle(),
    supabase
      .from("messages")
      .select("id, sender_id, kind, body, eta_minutes, sent_at, read_at")
      .eq("client_id", id)
      .order("sent_at", { ascending: false })
      .limit(500),
  ]);
  if (!client) notFound();
  const messages = [...(newestFirst ?? [])].reverse();

  // Anything the owner sent is read now that the walker has opened the thread.
  const unread = messages.filter((m) => m.sender_id !== user.id && !m.read_at).map((m) => m.id);
  if (unread.length) await supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", unread);

  return (
    <>
      <PageTitle sub={client.status === "invited" ? "They'll see these once they join with their link." : undefined}>
        {client.name}
      </PageTitle>
      {!messages.length ? (
        <Empty>No messages yet.</Empty>
      ) : (
        <ol className="mb-4 flex flex-col gap-2" aria-label="Messages">
          {messages.map((m) => {
            const mine = m.sender_id === user.id;
            return (
              <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                    mine ? "bg-accent text-accent-fg" : "border border-border bg-card"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className={`mt-1 text-xs ${mine ? "opacity-80" : "text-muted"}`}>
                    {fmtDate(m.sent_at, tz)} · {fmtTime(m.sent_at, tz)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <MessageForm clientId={client.id} />
    </>
  );
}
