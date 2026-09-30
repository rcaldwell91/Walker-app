import { headers } from "next/headers";
import { requireRole } from "@/lib/session";
import { platformFrom } from "@/lib/device";
import { PageTitle } from "@/components/ui";
import { BackBar } from "@/components/back-bar";
import { InstallGuide } from "@/components/install-guide";

/** How to add the app to your home screen. Linked from /profile and /my/more. */
export default async function InstallPage() {
  const { profile } = await requireRole("walker", "client", "operator");
  const platform = platformFrom((await headers()).get("user-agent"));
  const back = profile?.role === "client" ? "/my/more" : "/profile";
  return (
    <main className="mx-auto max-w-md px-4 pb-32 pt-6">
      <PageTitle sub="Opens full screen like an app, and can send you notifications.">Add Walker to your home screen</PageTitle>
      <InstallGuide platform={platform} doneHref={back} />
      <BackBar href={back} label={profile?.role === "client" ? "More" : "Profile"} />
    </main>
  );
}
