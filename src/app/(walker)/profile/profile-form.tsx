"use client";

import { useActionState } from "react";
import { saveProfile } from "./actions";
import { Button, Card, ErrorText, Field, Input, Select } from "@/components/ui";
import { VoiceInput } from "@/components/voice-input";

type Service = { id: string; name: string; defaultDuration: number; enabled: boolean; rate: string; duration: number | null };

const CADENCES = [7, 14, 30, 60, 90];

export function ProfileForm({
  initial,
  services,
}: {
  initial: {
    full_name: string;
    business_name: string;
    bio: string;
    service_area: string;
    check_in_cadence_days: number;
    suggestion_box_enabled: boolean;
    tips_enabled: boolean;
  };
  services: Service[];
}) {
  const [state, action, pending] = useActionState(saveProfile, undefined);
  const cadences = CADENCES.includes(initial.check_in_cadence_days) ? CADENCES : [...CADENCES, initial.check_in_cadence_days].sort((a, b) => a - b);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Your name">
        <Input name="full_name" defaultValue={initial.full_name} required autoComplete="name" />
      </Field>
      <Field label="Business name" hint="Optional. Shown at the top of your public page.">
        <Input name="business_name" defaultValue={initial.business_name} />
      </Field>
      <Field label="About you" hint="What clients see on your public page. Talk it out if that's easier.">
        <VoiceInput name="bio" defaultValue={initial.bio} rows={4} />
      </Field>
      <Field label="Where you walk" hint="e.g. Noe Valley, Glen Park, Bernal Heights">
        <Input name="service_area" defaultValue={initial.service_area} />
      </Field>

      <div>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Services and rates</h2>
        <ul className="flex flex-col gap-2">
          {services.map((s) => (
            <li key={s.id}>
              <Card className="flex flex-col gap-2" >
                <label className="flex items-center gap-2 font-medium">
                  <input type="checkbox" name={`svc_enabled[${s.id}]`} defaultChecked={s.enabled} className="h-5 w-5" />
                  {s.name}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Rate ($)">
                    <Input name={`svc_rate[${s.id}]`} inputMode="decimal" defaultValue={s.rate} placeholder="e.g. 25" aria-label={`${s.name} rate in dollars`} />
                  </Field>
                  <Field label="Minutes">
                    <Input
                      name={`svc_duration[${s.id}]`}
                      type="number"
                      min={5}
                      max={1440}
                      step={5}
                      defaultValue={s.duration ?? s.defaultDuration}
                      aria-label={`${s.name} minutes`}
                    />
                  </Field>
                </div>
              </Card>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-muted">Checked services show on your public page with their rate.</p>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Client relationship</h2>
        <Card className="flex flex-col gap-3">
          <Field label="Check in with clients every">
            <Select name="check_in_cadence_days" defaultValue={initial.check_in_cadence_days}>
              {cadences.map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="suggestion_box_enabled" defaultChecked={initial.suggestion_box_enabled} className="h-5 w-5" />
            Anonymous suggestion box on
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="tips_enabled" defaultChecked={initial.tips_enabled} className="h-5 w-5" />
            Clients can leave tips
          </label>
        </Card>
      </div>

      <ErrorText>{state?.error}</ErrorText>
      {state?.saved ? <p className="text-sm text-accent" role="status">Saved.</p> : null}
      <Button type="submit" disabled={pending} className="h-14 text-lg">
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
