"use client";

import { useActionState, useEffect, useState } from "react";
import { saveBooking } from "./actions";
import { Button, ErrorText, Field, Input, Select } from "@/components/ui";
import { WEEKDAYS } from "@/lib/time";

type ClientOpt = { id: string; name: string; dogs: { id: string; name: string }[] };
type ServiceOpt = { id: string; name: string; default_duration_min: number };

export type BookingInitial = {
  client_id?: string;
  service_type_id?: string;
  date: string;
  time: string;
  duration_min?: number;
  repeat_weekdays?: number[];
  repeat_until?: string | null;
  dog_ids?: string[];
};

export function BookingForm({
  bookingId,
  clients,
  services,
  initial,
}: {
  bookingId: string | null;
  clients: ClientOpt[];
  services: ServiceOpt[];
  initial: BookingInitial;
}) {
  const [state, action, pending] = useActionState(saveBooking.bind(null, bookingId), undefined);
  const [clientId, setClientId] = useState(initial.client_id ?? clients[0]?.id ?? "");
  const [serviceId, setServiceId] = useState(initial.service_type_id ?? services[0]?.id ?? "");
  const [duration, setDuration] = useState(initial.duration_min ?? services[0]?.default_duration_min ?? 60);
  const [repeat, setRepeat] = useState<Set<number>>(new Set(initial.repeat_weekdays ?? []));
  const client = clients.find((c) => c.id === clientId);
  const [dogIds, setDogIds] = useState<Set<string>>(new Set(initial.dog_ids ?? client?.dogs.map((d) => d.id) ?? []));
  const [tz, setTz] = useState("");

  useEffect(() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone), []);

  function pickClient(id: string) {
    setClientId(id);
    setDogIds(new Set(clients.find((c) => c.id === id)?.dogs.map((d) => d.id) ?? []));
  }
  function pickService(id: string) {
    setServiceId(id);
    const s = services.find((x) => x.id === id);
    if (s && !bookingId) setDuration(s.default_duration_min);
  }
  function toggle<T>(set: Set<T>, v: T) {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="tz" value={tz} />
      <Field label="Client">
        <Select name="client_id" value={clientId} onChange={(e) => pickClient(e.target.value)} required>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <div>
        <span className="mb-1 block text-sm font-medium">Dogs</span>
        {client?.dogs.length ? (
          <div className="flex flex-wrap gap-2">
            {client.dogs.map((d) => {
              const on = dogIds.has(d.id);
              return (
                <label
                  key={d.id}
                  className={`flex min-h-11 cursor-pointer items-center rounded-full border-2 px-4 text-sm font-medium ${
                    on ? "border-accent bg-accent/10" : "border-border bg-card"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="dog_id"
                    value={d.id}
                    checked={on}
                    onChange={() => setDogIds(toggle(dogIds, d.id))}
                    className="sr-only"
                  />
                  {d.name}
                </label>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted">No dogs on file for this client yet.</p>
        )}
      </div>

      <Field label="Service">
        <Select name="service_type_id" value={serviceId} onChange={(e) => pickService(e.target.value)} required>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input type="date" name="date" defaultValue={initial.date} required />
        </Field>
        <Field label="Time">
          <Input type="time" name="time" defaultValue={initial.time} required />
        </Field>
      </div>

      <Field label="Minutes">
        <Input
          type="number"
          name="duration_min"
          min={5}
          max={1440}
          step={5}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          required
        />
      </Field>

      <div>
        <span className="mb-1 block text-sm font-medium">Repeat every week on</span>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((w) => {
            const on = repeat.has(w.n);
            return (
              <label
                key={w.n}
                className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border-2 text-sm font-medium ${
                  on ? "border-accent bg-accent/10" : "border-border bg-card"
                }`}
              >
                <input
                  type="checkbox"
                  name="repeat_weekday"
                  value={w.n}
                  checked={on}
                  onChange={() => setRepeat(toggle(repeat, w.n))}
                  className="sr-only"
                />
                {w.short}
              </label>
            );
          })}
        </div>
        <span className="mt-1 block text-xs text-muted">Leave all off for a one-time booking.</span>
      </div>

      {repeat.size ? (
        <Field label="Repeat until" hint="Optional. Leave empty to keep repeating.">
          <Input type="date" name="repeat_until" defaultValue={initial.repeat_until ?? ""} />
        </Field>
      ) : null}

      <ErrorText>{state?.error}</ErrorText>
      <Button type="submit" disabled={pending || !tz} className="h-14 text-lg">
        {pending ? "Saving…" : bookingId ? "Save changes" : "Add booking"}
      </Button>
    </form>
  );
}
