"use client";

import { useActionState, useState } from "react";
import { addDogAction } from "@/app/(walker)/clients/actions";
import { Button, FormStatus, Input } from "@/components/ui";

export function AddDogForm({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addDogAction.bind(null, clientId), undefined);
  if (!open) {
    return (
      <Button type="button" variant="secondary" className="w-full" onClick={() => setOpen(true)}>
        + Add a pet
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Input name="name" placeholder="Pet's name" autoFocus required />
        <Button type="submit" disabled={pending} className="w-24 shrink-0">
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      <FormStatus error={state?.error} />
    </form>
  );
}
