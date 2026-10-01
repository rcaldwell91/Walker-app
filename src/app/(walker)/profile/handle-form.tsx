"use client";

import { useActionState, useEffect, useState } from "react";
import { saveHandle } from "./actions";
import { Button, Field, FormStatus, Input } from "@/components/ui";
import { cleanHandle } from "@/lib/input";

/** "Your public page link": the last part of the address, with the whole address shown as it's typed. */
export function HandleForm({ handle, base }: { handle: string; base: string }) {
  const [state, action, pending] = useActionState(saveHandle, undefined);
  const [value, setValue] = useState(handle);
  // Once saved, the box shows the link as it was saved (capitals lowered, spaces made dashes).
  useEffect(() => {
    if (state?.handle) setValue(state.handle);
  }, [state]);
  const shown = cleanHandle(value) || "…";
  return (
    <form action={action} noValidate className="flex flex-col gap-3">
      <Field label="Your public page link" hint="The end of your page's web address. Share the full address with new clients.">
        <Input name="handle" value={value} onChange={(e) => setValue(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} data-handle-input />
      </Field>
      <p className="break-all text-sm" data-handle-url>
        {base}/w/<span className="font-medium">{shown}</span>
      </p>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save link"}
      </Button>
      <FormStatus error={state?.error} ok={state?.saved && "Saved. Your page is at the address above."} />
    </form>
  );
}
