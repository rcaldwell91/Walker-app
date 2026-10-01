/**
 * Kinds of record a walker keeps, shown on More → Records. Add a line here to
 * add a kind: it gets a row on the Records page with its count. Each kind's own
 * page lives under /records/<key>.
 */
export const RECORD_KINDS = [
  {
    key: "incidents",
    label: "Incident reports",
    sub: "Anything that happened on a walk",
    href: "/records/incidents",
    table: "incidents",
  },
] as const;
