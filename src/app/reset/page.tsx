import { PageTitle } from "@/components/ui";
import { ChangePasswordForm } from "@/components/change-password-form";

/** Opened from the reset email (the link signs the person in first). */
export default function ResetPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <PageTitle>Set a new password</PageTitle>
      <ChangePasswordForm />
    </main>
  );
}
