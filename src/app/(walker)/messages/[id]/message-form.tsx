"use client";

import { useActionState } from "react";
import { sendMessage } from "../actions";
import { Button, Card, ErrorText } from "@/components/ui";
import { VoiceInput } from "@/components/voice-input";

export function MessageForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(sendMessage.bind(null, clientId), undefined);
  return (
    <Card>
      <form action={action} className="flex flex-col gap-2">
        {/* Remount after each send so the box clears. */}
        <VoiceInput key={state?.sentAt ?? 0} name="body" rows={2} placeholder="Tap the mic and talk. Or type." />
        <ErrorText>{state?.error}</ErrorText>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </Button>
      </form>
    </Card>
  );
}
