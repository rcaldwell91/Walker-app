"use client";

import { useActionState, useEffect, useState } from "react";
import { moveOccurrence } from "../actions";
import { Button, ErrorText, Field, Input } from "@/components/ui";

export function MoveOccurrenceForm({
  bookingId,
  day,
  defaultTime,
  defaultDuration,
}: {
  bookingId: string;
  day: string;
  defaultTime: string;
  defaultDuration: number;
}) {
  const [state, action, pending] = useActionState(moveOccurrence.bind(null, bookingId, day), undefined);
  const [tz, setTz] = useState("");
  useEffect(() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  return (
    <form noValidate action={action} className="flex flex-col gap-3">
      <input type="hidden" name="tz" value={tz} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="New date">
          <Input type="date" name="date" defaultValue={day} required />
        </Field>
        <Field label="New time">
          <Input type="time" name="time" defaultValue={defaultTime} required />
        </Field>
      </div>
      <Field label="Minutes">
        <Input inputMode="numeric" name="duration_min" defaultValue={defaultDuration} />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending || !tz}>
        {pending ? "Moving…" : "Move just this one"}
      </Button>
      <ErrorText>{state?.error}</ErrorText>
    </form>
  );
}
