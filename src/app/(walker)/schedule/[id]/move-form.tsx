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
    <form action={action} className="flex flex-col gap-3">
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
        <Input type="number" name="duration_min" min={5} max={1440} step={5} defaultValue={defaultDuration} required />
      </Field>
      <ErrorText>{state?.error}</ErrorText>
      <Button type="submit" variant="secondary" disabled={pending || !tz}>
        {pending ? "Moving…" : "Move just this one"}
      </Button>
    </form>
  );
}
