"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TZ_COOKIE } from "@/lib/time";

/** Tells the server which time zone this browser is in, so "today" and repeats land on the right days. */
export function TimeZoneSync() {
  const router = useRouter();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return;
    const current = document.cookie.match(new RegExp(`(?:^|; )${TZ_COOKIE}=([^;]*)`))?.[1];
    if (current && decodeURIComponent(current) === tz) return;
    document.cookie = `${TZ_COOKIE}=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [router]);
  return null;
}
