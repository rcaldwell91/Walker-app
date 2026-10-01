import { requireRole } from "@/lib/session";
import { PageTitle } from "@/components/ui";
import { BackBar } from "@/components/back-bar";
import { ChangePasswordForm } from "@/components/change-password-form";

export default async function ClientPasswordPage() {
  await requireRole("client");
  return (
    <>
      <PageTitle sub="You'll use it next time you log in.">Change password</PageTitle>
      <ChangePasswordForm back="/my/more" />
      <BackBar href="/my/more" label="More" />
    </>
  );
}
