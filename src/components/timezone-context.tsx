"use client";

import { createContext, useContext } from "react";
import { DEFAULT_TZ } from "@/lib/time";

const TimeZoneContext = createContext(DEFAULT_TZ);

/** Set in the layouts from the `tz` cookie, so server and browser render the same times. */
export function TimeZoneProvider({ tz, children }: { tz: string; children: React.ReactNode }) {
  return <TimeZoneContext.Provider value={tz}>{children}</TimeZoneContext.Provider>;
}

export function useTimeZone() {
  return useContext(TimeZoneContext);
}
