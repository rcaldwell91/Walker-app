import { redirect } from "next/navigation";

/** Incident reports moved under Records. Old links (notifications, bookmarks) still land there. */
export default function OldIncidentsPage() {
  redirect("/records/incidents");
}
