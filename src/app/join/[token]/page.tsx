import { createServiceClient } from "@/lib/supabase/server";
import { PageTitle } from "@/components/ui";
import JoinForm from "./join-form";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createServiceClient();
  const { data: invite } = await admin
    .from("client_invites")
    .select("token, expires_at, redeemed_at, client:clients(name, email), walker:walkers(business_name, profile:profiles(full_name))")
    .eq("token", token)
    .maybeSingle();

  if (!invite || invite.redeemed_at || new Date(invite.expires_at) < new Date()) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <PageTitle>This link isn&apos;t valid anymore</PageTitle>
        <p className="text-muted">Ask your walker to send you a fresh one.</p>
      </main>
    );
  }

  const client = Array.isArray(invite.client) ? invite.client[0] : invite.client;
  const walker = Array.isArray(invite.walker) ? invite.walker[0] : invite.walker;
  const walkerProfile = walker && (Array.isArray(walker.profile) ? walker.profile[0] : walker.profile);
  const walkerName = walker?.business_name || walkerProfile?.full_name || "your walker";

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <PageTitle sub={`${walkerName} uses this app to keep track of walks, notes, and photos. Create a login to see yours.`}>
        Hi {client?.name?.split(" ")[0] ?? "there"}
      </PageTitle>
      <JoinForm token={token} defaultEmail={client?.email ?? ""} defaultName={client?.name ?? ""} />
    </main>
  );
}
