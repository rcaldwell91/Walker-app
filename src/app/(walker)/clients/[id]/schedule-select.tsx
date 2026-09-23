"use client";

import { useRef } from "react";
import { Select } from "@/components/ui";
import { setBillingSchedule } from "../../money/actions";
import type { Schedule } from "@/lib/billing";

/** Saves as soon as it changes: one tap, no Save button. */
export function ScheduleSelect({ clientId, value, labels }: { clientId: string; value: Schedule; labels: Record<Schedule, string> }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={setBillingSchedule.bind(null, clientId)}>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Send invoices</span>
        <Select name="billing_schedule" defaultValue={value} onChange={() => form.current?.requestSubmit()} data-billing-schedule>
          {Object.entries(labels).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </Select>
      </label>
    </form>
  );
}
