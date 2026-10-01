"use client";

import { useState } from "react";
import Link from "next/link";
import { dismissPasswordNotice } from "@/app/(auth)/actions";
import { tap } from "@/lib/offline";

/**
 * Shown once after signing in with a password that has shown up in a known
 * breach. It's about the password, not the account: the account is fine.
 */
export function PasswordNoticeCard({ changeHref }: { changeHref: string }) {
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (gone) return null;
  return (
    <div className="mb-4 rounded-2xl border border-warn/40 bg-warn/10 p-4 text-sm" role="status" data-password-notice>
      <p className="mb-3">
        The password you signed in with has shown up in a known data breach. It still works here, but it&apos;s safer to change it.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Link href={changeHref} className="btn inline-flex h-11 items-center justify-center rounded-xl bg-accent px-3 font-medium text-accent-fg" data-change-now>
          Change it now
        </Link>
        <button
          type="button"
          className="h-11 rounded-xl border border-border bg-card px-3 font-medium"
          onClick={async () => {
            const r = await tap(() => dismissPasswordNotice());
            if (r?.error) setError(r.error);
            else setGone(true);
          }}
          data-dismiss-notice
        >
          Dismiss
        </button>
      </div>
      <p className="min-h-5 pt-1 text-warn">{error ?? ""}</p>
    </div>
  );
}
