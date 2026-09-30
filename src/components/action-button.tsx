"use client";

import { useState, useTransition, type ComponentProps } from "react";
import { Button } from "@/components/ui";
import { errorOf, tap } from "@/lib/offline";

/**
 * A button that runs a server action and, if it didn't go through, says so in
 * one line underneath (space reserved, so nothing moves). Success shows as the
 * page updating from the saved data, never as a guess.
 */
export function ActionButton({
  run,
  children,
  busyLabel,
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick"> & { run: () => Promise<unknown>; busyLabel?: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="flex flex-col gap-1">
      <Button
        {...props}
        type="button"
        disabled={pending || props.disabled}
        onClick={() =>
          start(async () => {
            setErr(null);
            setErr(errorOf(await tap(run)));
          })
        }
      >
        {pending && busyLabel ? busyLabel : children}
      </Button>
      <span className="min-h-4 text-xs text-warn" role="status">
        {err}
      </span>
    </span>
  );
}
