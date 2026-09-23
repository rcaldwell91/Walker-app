"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { requestCoverage } from "../../coverage-actions";
import { Button, ErrorText, Field, Input } from "@/components/ui";

type Member = { walker_id: string; full_name: string; handle: string; approved: boolean };

export function CoverRequestForm({
  bookingId,
  day,
  clientId,
  clientName,
  squad,
}: {
  bookingId: string;
  day: string;
  clientId: string;
  clientName: string;
  squad: Member[];
}) {
  const [state, action, pending] = useActionState(requestCoverage.bind(null, bookingId, day), undefined);
  const [pick, setPick] = useState(squad.find((m) => m.approved)?.walker_id ?? "");
  if (!squad.length) {
    return (
      <p className="text-sm text-muted">
        Add walkers to your <Link href="/squad" className="text-accent underline">squad</Link> first.
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3" key={state?.done ?? 0}>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Who should cover?</legend>
        <ul className="flex flex-col gap-2">
          {squad.map((m) => (
            <li key={m.walker_id}>
              <label
                className={`flex min-h-11 items-center gap-3 rounded-xl border-2 px-3 py-2 ${
                  !m.approved ? "border-border opacity-60" : pick === m.walker_id ? "border-accent bg-accent/10" : "border-border"
                }`}
                data-squad-member={m.handle}
                data-approved={m.approved ? "yes" : "no"}
              >
                <input
                  type="radio"
                  name="to_walker_id"
                  value={m.walker_id}
                  checked={pick === m.walker_id}
                  disabled={!m.approved}
                  onChange={() => setPick(m.walker_id)}
                  className="h-5 w-5"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{m.full_name}</span>
                  <span className="block text-xs text-muted">
                    {m.approved ? `✓ Approved by ${clientName}` : `Not approved by ${clientName} yet`}
                  </span>
                </span>
                {!m.approved ? (
                  <Link href={`/clients/${clientId}#backup-walkers`} className="shrink-0 text-xs text-accent">
                    Ask them
                  </Link>
                ) : null}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <Field label="Note (optional)">
        <Input name="message" maxLength={500} placeholder="e.g. Rex pulls toward squirrels" />
      </Field>
      <ErrorText>{state?.error}</ErrorText>
      {state?.done ? <p className="text-sm text-accent" role="status">Sent. You&apos;ll see here when they answer.</p> : null}
      <Button type="submit" disabled={pending || !pick}>
        {pending ? "Sending…" : "Need coverage"}
      </Button>
    </form>
  );
}
