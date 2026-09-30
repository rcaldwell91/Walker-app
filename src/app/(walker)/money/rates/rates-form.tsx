"use client";

import { useActionState } from "react";
import { saveRates } from "./actions";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";

export type RateRow = { id: string; name: string; defaultDuration: number; enabled: boolean; rate: string; duration: number | null };

export function RatesForm({ services }: { services: RateRow[] }) {
  const [state, action, pending] = useActionState(saveRates, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {services.map((s) => (
          <li key={s.id}>
            <Card className="flex flex-col gap-2">
              <label className="flex min-h-11 items-center gap-3 font-medium">
                <input type="checkbox" name={`svc_enabled[${s.id}]`} defaultChecked={s.enabled} className="h-5 w-5" />
                {s.name}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Rate ($)">
                  <Input name={`svc_rate[${s.id}]`} inputMode="decimal" defaultValue={s.rate} placeholder="e.g. 25" aria-label={`${s.name} rate in dollars`} />
                </Field>
                <Field label="Minutes">
                  <Input name={`svc_duration[${s.id}]`} type="number" min={5} max={1440} step={5} defaultValue={s.duration ?? s.defaultDuration} aria-label={`${s.name} minutes`} />
                </Field>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">Checked services show on your public page with their rate. Finished walks bill at these rates.</p>
      <ErrorText>{state?.error}</ErrorText>
      {state?.saved ? (
        <p className="text-sm text-accent" role="status">
          Saved.
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="h-14 text-lg">
        {pending ? "Saving…" : "Save rates"}
      </Button>
    </form>
  );
}
