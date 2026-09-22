"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  async function share() {
    try {
      await navigator.share({ title: "Join me on my walker app", text: "Here's your link:", url });
    } catch {
      /* user cancelled */
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <code className="block truncate rounded-xl bg-bg px-3 py-2 text-xs">{url}</code>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={copy}>
          {copied ? "Copied" : "Copy link"}
        </Button>
        {canShare ? (
          <Button type="button" className="flex-1" onClick={share}>
            Share
          </Button>
        ) : (
          <a
            className="btn flex flex-1 items-center justify-center rounded-xl bg-accent px-4 font-medium text-accent-fg"
            href={`sms:?&body=${encodeURIComponent(`Here's your link to join me on my walker app: ${url}`)}`}
          >
            Text it
          </a>
        )}
      </div>
    </div>
  );
}
