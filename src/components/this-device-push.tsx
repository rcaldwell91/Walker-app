"use client";

import { useEffect, useState } from "react";
import { pushSupported, turnOnPush } from "@/lib/push-client";
import { Button } from "@/components/ui";

export function ThisDevicePush() {
  const [state, setState] = useState<"checking" | "on" | "off" | "blocked" | "unsupported">("checking");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!pushSupported()) return setState("unsupported");
    if (Notification.permission === "denied") return setState("blocked");
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      setState(Notification.permission === "granted" && reg && (await reg.pushManager.getSubscription()) ? "on" : "off");
    });
  }, []);
  return (
    <div data-this-device={state}>
      <p className="text-sm">
        <span className="font-medium">This device: </span>
        {state === "on"
          ? "notifications are on."
          : state === "blocked"
            ? "notifications are blocked in your browser or phone settings."
            : state === "unsupported"
              ? "this browser can't show notifications. On iPhone, add the app to your home screen first."
              : state === "checking"
                ? "…"
                : "notifications are off."}
      </p>
      {state === "off" ? (
        <Button
          type="button"
          className="mt-2 w-full"
          onClick={async () => {
            const r = await turnOnPush();
            if (r.ok) setState("on");
            else setMsg(r.reason);
          }}
        >
          Turn on notifications
        </Button>
      ) : null}
      {msg ? <p className="mt-1 text-sm text-warn">{msg}</p> : null}
    </div>
  );
}
