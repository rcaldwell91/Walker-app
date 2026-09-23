export type PushKind = "message" | "status" | "report" | "homework" | "checkin" | "coverage" | "invoice" | "payment";

/** What each role can turn on/off, in settings order. */
export const PUSH_KINDS: { key: PushKind; label: string; roles: ("walker" | "client")[] }[] = [
  { key: "message", label: "New messages", roles: ["walker", "client"] },
  { key: "status", label: "“On my way”, “Here”, “Dropped off”", roles: ["client"] },
  { key: "report", label: "Walk report ready", roles: ["walker", "client"] },
  { key: "homework", label: "New homework", roles: ["client"] },
  { key: "checkin", label: "Check-in due", roles: ["client"] },
  { key: "coverage", label: "Coverage requests and changes", roles: ["walker"] },
  { key: "invoice", label: "New invoice", roles: ["client"] },
  { key: "payment", label: "Payment received", roles: ["client"] },
];
