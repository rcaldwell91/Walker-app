import { requireRole } from "@/lib/session";
import { PageTitle } from "@/components/ui";
import { BackBar } from "@/components/back-bar";
import { ChangePasswordForm } from "@/components/change-password-form";

export default async function WalkerPasswordPage() {
  await requireRole("walker", "operator");
  return (
    <>
      <PageTitle sub="You'll use it next time you log in.">Change password</PageTitle>
      <ChangePasswordForm back="/profile" />
      <BackBar href="/profile" label="Profile & account" />
    </>
  );
}
