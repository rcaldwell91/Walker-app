"use client";

import { useActionState, useState } from "react";
import { answerCheckIn, leaveTip, rateWalk, sendSuggestion } from "./relationship-actions";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";
import { ScoreInput } from "@/components/score-input";
import { VoiceInput } from "@/components/voice-input";

export function CheckInForm({ checkInId, walkerName }: { checkInId: string; walkerName: string }) {
  const [state, action, pending] = useActionState(answerCheckIn.bind(null, checkInId), undefined);
  if (state?.done) {
    return (
      <Card className="mb-4" data-check-in="done">
        <p className="font-medium">Thanks! {walkerName} will see your answers.</p>
      </Card>
    );
  }
  return (
    <Card className="mb-4 border-accent" data-check-in="open">
      <p className="font-medium">Check-in</p>
      <p className="mb-3 text-sm text-muted">A few quick questions from {walkerName}. Takes a minute.</p>
      <form action={action} className="flex flex-col gap-4">
        <ScoreInput name="walker_satisfaction" label={`How happy are you with ${walkerName}?`} low="Not happy" high="Love it" />
        <ScoreInput name="app_satisfaction" label="How's this app working for you?" low="Frustrating" high="Easy" />
        <Field label="Progress you've seen in your dog">
          <VoiceInput name="dog_progress" rows={2} />
        </Field>
        <Field label="What you're working on at home">
          <VoiceInput name="at_home_training" rows={2} />
        </Field>
        <Field label="Anything you'd like">
          <VoiceInput name="requests" rows={2} placeholder="Longer walks, different trail, a question…" />
        </Field>
        <ErrorText>{state?.error}</ErrorText>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send check-in"}
        </Button>
      </form>
    </Card>
  );
}

export function SuggestionForm({ walkerId, walkerName }: { walkerId: string; walkerName: string }) {
  const [state, action, pending] = useActionState(sendSuggestion.bind(null, walkerId), undefined);
  const [signed, setSigned] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-3" key={state?.done ?? 0}>
      <Field label={`Suggestion for ${walkerName}`}>
        <VoiceInput name="body" rows={3} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="signed" checked={signed} onChange={(e) => setSigned(e.target.checked)} className="h-5 w-5" />
        Put my name on it
      </label>
      <p className="text-xs text-muted">
        {signed ? `${walkerName} will see it's from you.` : "Anonymous: your name isn't sent or stored with it."}
      </p>
      <ErrorText>{state?.error}</ErrorText>
      {state?.done ? <p className="text-sm text-accent" role="status">Sent. Thank you!</p> : null}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Sending…" : signed ? "Send with my name" : "Send anonymously"}
      </Button>
    </form>
  );
}

export function RateWalkForm({ walkId, walkerName }: { walkId: string; walkerName: string }) {
  const [state, action, pending] = useActionState(rateWalk.bind(null, walkId), undefined);
  if (state?.done) return <p className="text-sm text-accent" role="status">Thanks for rating the walk.</p>;
  return (
    <form action={action} className="flex flex-col gap-3">
      <ScoreInput name="score" label={`How was this walk with ${walkerName}?`} />
      <Field label="Comment (optional)">
        <Input name="comment" maxLength={1000} />
      </Field>
      <ErrorText>{state?.error}</ErrorText>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Rate this walk"}
      </Button>
    </form>
  );
}

const PRESETS = [5, 10, 20];

export function TipForm({ walkId }: { walkId: string }) {
  const [state, action, pending] = useActionState(leaveTip.bind(null, walkId), undefined);
  const [amount, setAmount] = useState("");
  if (state?.done) return <TipThanks amount={Number(amount)} />;
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {PRESETS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setAmount(String(n))}
            aria-pressed={amount === String(n)}
            className={`rounded-xl border-2 text-lg font-semibold ${amount === String(n) ? "border-accent bg-accent text-accent-fg" : "border-border bg-card"}`}
          >
            ${n}
          </button>
        ))}
      </div>
      <Field label="Or another amount ($)">
        <Input name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 15" />
      </Field>
      <ErrorText>{state?.error}</ErrorText>
      <Button type="submit" disabled={pending || !amount}>
        {pending ? "Saving…" : amount ? `Leave a $${amount} tip` : "Pick an amount"}
      </Button>
    </form>
  );
}

export function TipThanks({ amount }: { amount: number }) {
  return (
    <div role="status" data-tip="left">
      <p className="font-medium">You left a ${amount % 1 ? amount.toFixed(2) : amount} tip.</p>
      <p className="text-sm text-muted">Tips coming soon — your walker will see this.</p>
    </div>
  );
}
