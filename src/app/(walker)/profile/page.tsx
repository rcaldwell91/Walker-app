import Link from "next/link";
import { requireRole } from "@/lib/session";
import { Card, PageTitle } from "@/components/ui";
import { ProfileForm } from "./profile-form";
import { AvatarUpload, BackgroundCheckUpload } from "./uploads";
import { NotificationSettings } from "@/components/notification-settings";

export default async function ProfilePage() {
  const { supabase, user, profile } = await requireRole("walker", "operator");
  const [{ data: walker }, { data: types }, { data: mine }] = await Promise.all([
    supabase
      .from("walkers")
      .select("handle, business_name, bio, service_area, check_in_cadence_days, suggestion_box_enabled, tips_enabled, background_check_path, background_check_verified_at")
      .eq("id", user.id)
      .single(),
    supabase.from("service_types").select("id, name, default_duration_min, walker_id, sort_order").order("sort_order"),
    supabase.from("walker_services").select("service_type_id, rate_cents, duration_min, enabled").eq("walker_id", user.id),
  ]);
  if (!walker) return <PageTitle>Profile not found</PageTitle>;

  const byType = new Map((mine ?? []).map((s) => [s.service_type_id, s]));
  const services = (types ?? [])
    .filter((t) => t.walker_id === null || t.walker_id === user.id)
    .map((t) => {
      const s = byType.get(t.id);
      return {
        id: t.id,
        name: t.name,
        defaultDuration: t.default_duration_min,
        enabled: s?.enabled ?? false,
        rate: s ? (s.rate_cents / 100).toFixed(2).replace(/\.00$/, "") : "",
        duration: s?.duration_min ?? null,
      };
    });

  let proofUrl: string | null = null;
  if (walker.background_check_path) {
    const { data } = await supabase.storage.from("documents").createSignedUrl(walker.background_check_path, 600);
    proofUrl = data?.signedUrl ?? null;
  }

  return (
    <>
      <PageTitle
        sub={
          <>
            Your public page:{" "}
            <Link href={`/w/${walker.handle}`} className="text-accent underline">
              /w/{walker.handle}
            </Link>
          </>
        }
      >
        My profile
      </PageTitle>

      <Card className="mb-4">
        <AvatarUpload userId={user.id} current={profile?.avatar_url ?? null} name={profile?.full_name ?? ""} />
      </Card>

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
        services={services}
      />

      <h2 className="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-muted">Notifications</h2>
      <NotificationSettings role="walker" off={profile?.notify_off ?? []} />

      <h2 className="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-muted">Background check</h2>
      <Card>
        <p className="mb-1 text-sm" data-check-status={walker.background_check_verified_at ? "verified" : walker.background_check_path ? "pending" : "none"}>
          {walker.background_check_verified_at
            ? "Verified. It shows as “Background checked” on your public page."
            : walker.background_check_path
              ? "Uploaded. We'll review it and mark it verified."
              : "Upload proof of a background check (PDF or photo). Only you and the platform can see the file."}
        </p>
        {proofUrl ? (
          <a href={proofUrl} target="_blank" rel="noreferrer" className="mb-3 block text-sm text-accent underline">
            View what you uploaded
          </a>
        ) : null}
        <BackgroundCheckUpload userId={user.id} hasFile={!!walker.background_check_path} />
      </Card>
    </>
  );
}
