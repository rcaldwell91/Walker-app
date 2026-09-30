"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { PUSH_KINDS } from "@/lib/push-kinds";
import { setNotifyOff } from "@/app/push-actions";
import { Card } from "@/components/ui";
import { errorOf, tap } from "@/lib/offline";
import { ThisDevicePush } from "./this-device-push";

/** Push settings: which kinds (each saves when tapped), plus this device on/off. */
export function NotificationSettings({ role, off }: { role: "walker" | "client"; off: string[] }) {
  const kinds = PUSH_KINDS.filter((k) => k.roles.includes(role));
  const [on, setOn] = useState(() => new Set(kinds.filter((k) => !off.includes(k.key)).map((k) => k.key as string)));
  const [status, setStatus] = useState<{ text: string; bad: boolean } | null>(null);
  const [pending, start] = useTransition();

  function toggle(key: string) {
    const before = on;
    const next = new Set(on);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOn(next);
    start(async () => {
      const e = errorOf(await tap(() => setNotifyOff([...next])));
      if (e) setOn(before); // didn't save: show what's really stored
      setStatus(e ? { text: e, bad: true } : { text: "Saved.", bad: false });
    });
  }

  return (
    <Card className="flex flex-col gap-3" data-notification-settings>
      <ThisDevicePush />
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Send me a notification for</p>
        {kinds.map((k) => (
          <label key={k.key} className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" checked={on.has(k.key)} onChange={() => toggle(k.key)} disabled={pending} className="h-5 w-5 shrink-0" data-kind={k.key} />
            {k.label}
          </label>
        ))}
        <p className={`min-h-5 text-sm ${status?.bad ? "text-warn" : "text-accent"}`} role="status">
          {status?.text}
        </p>
      </div>
      <Link href="/install" className="min-h-11 py-2 text-sm text-accent underline">
        How to add to home screen
      </Link>
    </Card>
  );
}
