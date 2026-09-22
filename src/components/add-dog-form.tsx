"use client";

import { useActionState, useState } from "react";
import { addDogAction } from "@/app/(walker)/clients/actions";
import { Button, ErrorText, Input } from "@/components/ui";

export function AddDogForm({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addDogAction.bind(null, clientId), undefined);
  if (!open) {
    return (
      <Button type="button" variant="secondary" className="w-full" onClick={() => setOpen(true)}>
        + Add a dog
      </Button>
    );
  }
  return (
    <form action={action} className="flex gap-2">
      <Input name="name" placeholder="Dog's name" autoFocus required />
      <Button type="submit" disabled={pending}>
        Add
      </Button>
      <ErrorText>{state?.error}</ErrorText>
    </form>
  );
}
