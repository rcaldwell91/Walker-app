"use client";

import { useActionState } from "react";
import { sendClientMessage } from "../relationship-actions";
import { Button, Card, ErrorText } from "@/components/ui";
import { VoiceInput } from "@/components/voice-input";
import { FormDraft } from "@/components/form-draft";

export function ReplyForm({ walkerId, walkerName }: { walkerId: string; walkerName: string }) {
  const [state, action, pending] = useActionState(sendClientMessage.bind(null, walkerId), undefined);
  return (
    <Card className="mb-4">
      <form noValidate action={action} className="flex flex-col gap-2">
        <FormDraft id={`reply:${walkerId}`} done={state?.done} />
        {/* Remount after each send so the box clears. */}
        <VoiceInput key={state?.done ?? 0} name="body" rows={2} placeholder={`Message ${walkerName}`} />
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : `Send to ${walkerName}`}
        </Button>
        <ErrorText>{state?.error}</ErrorText>
      </form>
    </Card>
  );
}
