import Link from "next/link";
import { cookies, headers } from "next/headers";
import { requireRole } from "@/lib/session";
import { logout } from "@/app/(auth)/actions";
import { Button, Card, NavList, PageTitle, SectionTitle } from "@/components/ui";
import { BackBar } from "@/components/back-bar";
import { ThemeToggle } from "@/components/theme-toggle";
import { THEME_COOKIE, isThemeChoice } from "@/lib/theme";
import { ProfileForm } from "./profile-form";
import { HandleForm } from "./handle-form";
import { AvatarUpload, BackgroundCheckUpload } from "./uploads";
import { SpacePhotos } from "./space-photos";
import { NotificationSettings } from "@/components/notification-settings";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ password?: string }> }) {
  const { password } = await searchParams;
  const { supabase, user, profile } = await requireRole("walker", "operator");
  const themeCookie = (await cookies()).get(THEME_COOKIE)?.value;
  const [{ data: walker }, { data: space }] = await Promise.all([
    supabase
      .from("walkers")
      .select("handle, business_name, bio, service_area, check_in_cadence_days, suggestion_box_enabled, tips_enabled, background_check_path, background_check_verified_at")
      .eq("id", user.id)
      .single(),
    supabase.from("walker_space_photos").select("id, storage_path, caption").eq("walker_id", user.id).order("created_at"),
  ]);
  if (!walker) return <PageTitle>Profile not found</PageTitle>;
  const host = (await headers()).get("host");
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || (host ? `https://${host}` : "")).replace(/\/$/, "");

  let proofUrl: string | null = null;
  if (walker.background_check_path) {
    const { data } = await supabase.storage.from("documents").createSignedUrl(walker.background_check_path, 600);
    proofUrl = data?.signedUrl ?? null;
  }

  return (
    <>
      <PageTitle sub={profile?.full_name}>Profile & account</PageTitle>
      {password === "changed" ? (
        <p className="mb-3 text-sm text-accent" role="status">
          Password changed.
        </p>
      ) : null}

      <NavList
        items={[
          { href: `/w/${walker.handle}`, label: "Your public page", sub: "What clients see. Change its link below" },
          { href: "/profile/password", label: "Change password" },
          { href: "/install", label: "Add to home screen", sub: "Open Walker like an app, full screen" },
          { href: "/billing", label: "Plan and fees" },
        ]}
      />

      <SectionTitle>Photo</SectionTitle>
      <Card>
        <AvatarUpload userId={user.id} current={profile?.avatar_url ?? null} name={profile?.full_name ?? ""} />
      </Card>

      <SectionTitle>Your boarding space</SectionTitle>
      <Card>
        <SpacePhotos
          userId={user.id}
          photos={(space ?? []).map((s) => ({ id: s.id, caption: s.caption, url: supabase.storage.from("avatars").getPublicUrl(s.storage_path).data.publicUrl }))}
        />
      </Card>

      <SectionTitle>Public page link</SectionTitle>
      <Card>
        <HandleForm handle={walker.handle} base={appUrl} />
      </Card>

      <SectionTitle>Profile</SectionTitle>
      <ProfileForm
        initial={{
          full_name: profile?.full_name ?? "",
          business_name: walker.business_name,
          bio: walker.bio,
          service_area: walker.service_area,
          check_in_cadence_days: walker.check_in_cadence_days,
          suggestion_box_enabled: walker.suggestion_box_enabled,
          tips_enabled: walker.tips_enabled,
        }}
      />
      <Link href="/money/rates" className="mt-2 block min-h-11 py-2 text-sm text-accent underline">
        Your rates
      </Link>

      <SectionTitle>Appearance</SectionTitle>
      <ThemeToggle initial={isThemeChoice(themeCookie) ? themeCookie : "system"} />

      <SectionTitle>Notifications</SectionTitle>
      <NotificationSettings role="walker" off={profile?.notify_off ?? []} />

      <SectionTitle>Background check</SectionTitle>
      <Card>
        <p className="mb-1 text-sm" data-check-status={walker.background_check_verified_at ? "verified" : walker.background_check_path ? "pending" : "none"}>
          {walker.background_check_verified_at
            ? "Verified. It shows as “Background checked” on your public page."
            : walker.background_check_path
              ? "Uploaded. We'll review it and mark it verified."
              : "Upload proof of a background check (PDF or photo). Only you and the platform can see the file."}
        </p>
        {proofUrl ? (
          <a href={proofUrl} target="_blank" rel="noreferrer" className="mb-3 block min-h-11 py-2 text-sm text-accent underline">
            View what you uploaded
          </a>
        ) : null}
        <BackgroundCheckUpload userId={user.id} hasFile={!!walker.background_check_path} />
      </Card>

      <form noValidate action={logout} className="mt-8">
        <Button type="submit" variant="secondary" className="w-full">
          Log out
        </Button>
      </form>

      <BackBar href="/more" label="More" />
    </>
  );
}
