"use client";

import { useActionState } from "react";
import { findWalker, sendLinkRequest, type FindState } from "./actions";
import { Button, Card, ErrorText, Input } from "@/components/ui";
import { WalkerCard } from "./walker-card";

export function FindWalker() {
  const [found, find, finding] = useActionState(findWalker, undefined);
  return (
    <Card className="mb-6">
      <form action={find} className="flex gap-2">
        <Input name="handle" placeholder="Their handle, e.g. jess-walks" aria-label="Walker handle" autoCapitalize="none" required />
        <Button type="submit" variant="secondary" disabled={finding}>
          {finding ? "…" : "Find"}
        </Button>
      </form>
      <ErrorText>{found?.error}</ErrorText>
      {found?.found ? <SendRequest key={found.found.id} walker={found.found} /> : null}
    </Card>
  );
}

function SendRequest({ walker }: { walker: NonNullable<NonNullable<FindState>["found"]> }) {
  const [state, send, pending] = useActionState(sendLinkRequest.bind(null, walker.id), undefined);
  return (
    <div className="mt-3 flex flex-col gap-2" data-found={walker.handle}>
      <WalkerCard w={walker} />
      {state?.sent ? (
        <p className="text-sm text-accent" role="status">Request sent. They&apos;ll see it on their Squad page.</p>
      ) : (
        <form action={send}>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Sending…" : `Ask ${walker.full_name.split(" ")[0]} to join your squad`}
          </Button>
        </form>
      )}
      <ErrorText>{state?.error}</ErrorText>
    </div>
  );
}
