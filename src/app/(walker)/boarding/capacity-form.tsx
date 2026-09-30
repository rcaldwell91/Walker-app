"use client";

import { useActionState } from "react";
import { setCapacity } from "./actions";
import { Button, ErrorText, Input } from "@/components/ui";

export function CapacityForm({ capacity }: { capacity: number }) {
  const [state, action, pending] = useActionState(setCapacity, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <label className="flex-1">
          <span className="mb-1 block text-sm font-medium">Pets at once</span>
          <Input name="capacity" type="number" inputMode="numeric" min={0} max={100} defaultValue={capacity} data-capacity />
        </label>
        <Button type="submit" variant="secondary" disabled={pending} className="min-w-24">
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <ErrorText>{state?.error}</ErrorText>
      <p className="min-h-5 text-sm text-accent" role="status">
        {state?.saved ? "Saved." : ""}
      </p>
    </form>
  );
}
