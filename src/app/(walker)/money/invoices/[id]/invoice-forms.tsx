"use client";

import { useActionState, useState } from "react";
import { Button, Card, ErrorText, Field, Input, Select } from "@/components/ui";
import { cents } from "@/lib/format";
import { METHOD_LABEL } from "@/lib/billing";
import { addLine, recordPayment, removeLine, updateLine } from "../../actions";

type Line = { id: string; kind: string; description: string; date: string; amount: number };

const dollars = (c: number) => (Math.abs(c) / 100).toFixed(2).replace(/\.00$/, "");

export function LineRow({ invoiceId, line, editable }: { invoiceId: string; line: Line; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(updateLine.bind(null, line.id, invoiceId), undefined);
  if (editing && editable && !state?.done) {
    return (
      <li className="py-2">
        <form action={action} className="flex flex-col gap-2">
          <Input name="description" defaultValue={line.description} aria-label="Description" required />
          <div className="flex gap-2">
            <Input name="amount" defaultValue={dollars(line.amount)} inputMode="decimal" aria-label="Amount in dollars" />
            <Button type="submit" disabled={pending}>Save</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
          <ErrorText>{state?.error}</ErrorText>
        </form>
      </li>
    );
  }
  return (
    <li className="flex items-center justify-between gap-2 py-2 text-sm" data-line-kind={line.kind}>
      <span>
        {line.description}
        <span className="block text-xs text-muted">{line.date}</span>
      </span>
      <span className="flex items-center gap-2">
        <span className={line.amount < 0 ? "text-accent" : ""}>{line.amount < 0 ? `−${cents(-line.amount)}` : cents(line.amount)}</span>
        {editable ? (
          <>
            <button type="button" className="text-xs text-accent underline" onClick={() => setEditing(true)} data-edit-line>
              Edit
            </button>
            <form action={removeLine.bind(null, line.id, invoiceId)}>
              <button className="text-xs text-muted underline" title={line.kind === "walk" ? "Moves it to the next invoice" : "Delete"}>
                {line.kind === "walk" ? "Later" : "Remove"}
              </button>
            </form>
          </>
        ) : null}
      </span>
    </li>
  );
}

export function AddLineForm({ invoiceId, today }: { invoiceId: string; today: string }) {
  const [state, action, pending] = useActionState(addLine.bind(null, invoiceId), undefined);
  return (
    <Card>
      <form action={action} className="flex flex-col gap-3" key={state?.done ?? 0}>
        <p className="font-medium">Add a fee or discount</p>
        <div className="grid grid-cols-2 gap-2">
          <Select name="kind" defaultValue="extra" aria-label="Kind">
            <option value="extra">Extra charge</option>
            <option value="discount">Discount</option>
          </Select>
          <Input name="amount" placeholder="$ amount" inputMode="decimal" aria-label="Amount in dollars" required />
        </div>
        <Input name="description" placeholder="e.g. Key pickup" aria-label="Description" required maxLength={200} />
        <Field label="Date">
          <Input name="occurred_on" type="date" defaultValue={today} />
        </Field>
        <ErrorText>{state?.error}</ErrorText>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Adding…" : "Add line"}
        </Button>
      </form>
    </Card>
  );
}

export function PaymentForm({ invoiceId, today, balance }: { invoiceId: string; today: string; balance: number }) {
  const [state, action, pending] = useActionState(recordPayment.bind(null, invoiceId), undefined);
  return (
    <Card>
      <form action={action} className="flex flex-col gap-3" key={state?.done ?? 0}>
        <p className="font-medium">Mark a payment received</p>
        <Field label="Amount" hint={`${cents(balance)} still owed. Partial payments are fine.`}>
          <Input name="amount" defaultValue={dollars(balance)} inputMode="decimal" required />
        </Field>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">How</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(METHOD_LABEL).map(([value, label], i) => (
              <label key={value} className="cursor-pointer">
                <input type="radio" name="method" value={value} defaultChecked={i === 0} className="peer sr-only" />
                <span className="inline-block rounded-xl border border-border px-4 py-2 peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-fg">
                  {label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Received on">
          <Input name="received_on" type="date" defaultValue={today} />
        </Field>
        <Input name="note" placeholder="Note (optional)" maxLength={200} aria-label="Note" />
        <ErrorText>{state?.error}</ErrorText>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Mark received"}
        </Button>
      </form>
    </Card>
  );
}
