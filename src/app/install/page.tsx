import Link from "next/link";
import { headers } from "next/headers";
import { requireRole } from "@/lib/session";
import { platformFrom } from "@/lib/device";
import { PageTitle } from "@/components/ui";
import { InstallGuide } from "@/components/install-guide";

/** How to add the app to your home screen. Linked from /profile and /my/more. */
export default async function InstallPage() {
  const { profile } = await requireRole("walker", "client", "operator");
  const platform = platformFrom((await headers()).get("user-agent"));
  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <PageTitle sub="Opens full screen like an app, and can send you notifications.">Add Walker to your home screen</PageTitle>
      <InstallGuide platform={platform} />
      <p className="mt-6 text-center text-sm">
        <Link href={profile?.role === "client" ? "/my/more" : "/profile"} className="text-accent">
          ‹ Back
        </Link>
      </p>
    </main>
  );
}
