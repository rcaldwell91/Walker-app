"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { TZ_COOKIE } from "@/lib/time";
import { saveTimeZone } from "@/app/tz-actions";

/**
 * Keeps the `tz` cookie in step with this browser (the middleware sets it on
 * the first visit) and saves the zone on the profile once per session.
 */
export function TimeZoneSync() {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return;
    try {
      if (sessionStorage.getItem("tz-saved") !== tz) {
        // Not marked saved until it is: on /login there's no session yet.
        saveTimeZone(tz)
          .then((saved) => saved && sessionStorage.setItem("tz-saved", tz))
          .catch(() => {});
      }
    } catch {
      /* private mode */
    }
    const current = document.cookie.match(new RegExp(`(?:^|; )${TZ_COOKIE}=([^;]*)`))?.[1];
    if (current && decodeURIComponent(current) === tz) return;
    document.cookie = `${TZ_COOKIE}=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [router, pathname]);
  return null;
}
