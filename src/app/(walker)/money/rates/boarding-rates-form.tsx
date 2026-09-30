"use client";

import { useActionState } from "react";
import { saveBoardingRates } from "../../boarding/actions";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";

const dollars = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(/\.00$/, ""));

export function BoardingRatesForm({ night, extra }: { night: number | null; extra: number | null }) {
  const [state, action, pending] = useActionState(saveBoardingRates, undefined);
  return (
    <form action={action} className="flex flex-col gap-3" data-boarding-rates>
      <Card className="grid grid-cols-2 gap-2">
        <Field label="Per night ($)" hint="First pet">
          <Input name="night" inputMode="decimal" defaultValue={dollars(night)} placeholder="e.g. 50" data-night-rate />
        </Field>
        <Field label="Each extra pet ($)" hint="Per night, same client">
          <Input name="extra" inputMode="decimal" defaultValue={dollars(extra)} placeholder="e.g. 30" data-extra-rate />
        </Field>
      </Card>
      <ErrorText>{state?.error}</ErrorText>
      <p className="min-h-5 text-sm text-accent" role="status">
        {state?.saved ? "Saved." : ""}
      </p>
      <Button type="submit" variant="secondary" disabled={pending} data-save-boarding-rates>
        {pending ? "Saving…" : "Save boarding rates"}
      </Button>
    </form>
  );
}
