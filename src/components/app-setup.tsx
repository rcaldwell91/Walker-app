"use client";

import { useEffect, useState } from "react";
import type { Platform } from "@/lib/device";
import { dismissInstallGuide, markInstalled } from "@/app/push-actions";
import { isStandalone, pushSupported, registerServiceWorker, turnOnPush } from "@/lib/push-client";
import { Button, Card } from "@/components/ui";
import { InstallGuide } from "./install-guide";

/**
 * In both app layouts: registers the service worker, notices when the app is
 * opened from the home screen, shows the install walkthrough after first
 * login, and then asks to turn on notifications.
 */
export function AppSetup({ platform, showGuide }: { platform: Platform; showGuide: boolean }) {
  const [standalone, setStandalone] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [askPush, setAskPush] = useState(false);

  useEffect(() => {
    registerServiceWorker()?.catch(() => {});
    const sa = isStandalone();
    setStandalone(sa);
    if (sa) markInstalled().catch(() => {});
    setGuideOpen(showGuide && !sa && platform !== "other");
    // Ask for notifications once installed (iPhone only allows it then), or right away on Android.
    const snoozed = (() => {
      try {
        return Number(localStorage.getItem("push-ask-snoozed") ?? 0) > Date.now();
      } catch {
        return false;
      }
    })();
    setAskPush(pushSupported() && Notification.permission === "default" && (sa || platform === "android") && !snoozed);
    // Already allowed on this device: make sure the server has this subscription.
    if (pushSupported() && Notification.permission === "granted") turnOnPush().catch(() => {});
  }, [platform, showGuide]);

  function closeGuide() {
    setGuideOpen(false);
    dismissInstallGuide().catch(() => {});
  }

  return (
    <>
      {guideOpen ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-2 sm:items-center" role="dialog" aria-modal="true" aria-label="Add to Home Screen">
          <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-3xl bg-bg p-4">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <p className="text-lg font-semibold">Put Walker on your home screen</p>
                <p className="text-sm text-muted">It opens like an app, full screen, and can send you notifications.</p>
              </div>
              <button type="button" onClick={closeGuide} className="shrink-0 text-sm text-muted underline">
                Not now
              </button>
            </div>
            <InstallGuide platform={platform} onClose={closeGuide} />
          </div>
        </div>
      ) : null}

      {askPush && !guideOpen ? (
        <div className="mx-auto max-w-md px-4 pt-4">
          <PushAsk
            standalone={standalone}
            onDone={() => setAskPush(false)}
          />
        </div>
      ) : null}
    </>
  );
}

function PushAsk({ standalone, onDone }: { standalone: boolean; onDone: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card className="border-accent" data-push-ask>
      <p className="font-medium">Turn on notifications?</p>
      <p className="mb-3 text-sm text-muted">
        {standalone ? "You're set up on your home screen. " : ""}Get messages, walk updates and invoices as they happen. You can choose which ones later.
      </p>
      {msg ? <p className="mb-2 text-sm text-warn">{msg}</p> : null}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={() => {
            try {
              localStorage.setItem("push-ask-snoozed", String(Date.now() + 7 * 86400000));
            } catch {}
            onDone();
          }}
        >
          Not now
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await turnOnPush();
            setBusy(false);
            if (r.ok) onDone();
            else setMsg(r.reason);
          }}
        >
          Turn on
        </Button>
      </div>
    </Card>
  );
}
