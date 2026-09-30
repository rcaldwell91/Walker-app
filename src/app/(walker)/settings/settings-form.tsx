"use client";

import { useState, useTransition, type ReactNode } from "react";
import { saveSetting } from "./actions";
import { Card, Input, SectionTitle } from "@/components/ui";
import { METHOD_LABEL } from "@/lib/billing";
import { errorOf, tap } from "@/lib/offline";

type Initial = {
  dropoff: string;
  pickup: string;
  earlyPickup: "booked" | "actual";
  untaggedToAll: boolean;
  methods: string[];
  tips: number[];
  etaMph: number;
};

/** A setting and its own status line (space kept, so nothing moves). Rolls back if the save fails. */
function useSetting<T>(field: string, initial: T) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<{ text: string; bad: boolean } | null>(null);
  const [, start] = useTransition();
  const save = (next: T) => {
    const before = value;
    setValue(next);
    start(async () => {
      const e = errorOf(await tap(() => saveSetting(field, next)));
      if (e) setValue(before);
      setStatus(e ? { text: e, bad: true } : { text: "Saved.", bad: false });
    });
  };
  const line = (
    <p className={`min-h-5 text-sm ${status?.bad ? "text-warn" : "text-accent"}`} role="status">
      {status?.text}
    </p>
  );
  return { value, setValue, save, line, status };
}

function Choice({ name, checked, onPick, children }: { name: string; checked: boolean; onPick: () => void; children: ReactNode }) {
  return (
    <label className="flex min-h-11 items-start gap-3 py-1 text-sm">
      <input type="radio" name={name} checked={checked} onChange={onPick} className="mt-0.5 h-5 w-5 shrink-0" />
      <span>{children}</span>
    </label>
  );
}

export function SettingsForm({ initial }: { initial: Initial }) {
  const dropoff = useSetting("boarding_dropoff_time", initial.dropoff);
  const pickup = useSetting("boarding_pickup_time", initial.pickup);
  const early = useSetting("boarding_early_pickup", initial.earlyPickup);
  const untagged = useSetting("untagged_photos_to_all", initial.untaggedToAll);
  const methods = useSetting("payment_methods", initial.methods);
  const tips = useSetting("tip_presets", initial.tips);
  const [tipText, setTipText] = useState(initial.tips.join(", "));
  const eta = useSetting("eta_mph", initial.etaMph);
  const [etaText, setEtaText] = useState(String(initial.etaMph));

  return (
    <div className="flex flex-col" data-settings>
      <SectionTitle>Boarding</SectionTitle>
      <Card className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="mb-1 block text-sm font-medium">Usual drop-off</span>
            <Input type="time" value={dropoff.value} onChange={(e) => e.target.value && dropoff.save(e.target.value)} data-setting="dropoff" />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Usual pick-up</span>
            <Input type="time" value={pickup.value} onChange={(e) => e.target.value && pickup.save(e.target.value)} data-setting="pickup" />
          </label>
        </div>
        {/* One line for both times: whichever changed last. */}
        <p className={`min-h-5 text-sm ${(pickup.status ?? dropoff.status)?.bad ? "text-warn" : "text-accent"}`} role="status">
          {(pickup.status ?? dropoff.status)?.text}
        </p>
        <p className="text-sm font-medium">When a pet goes home early</p>
        <div>
          <Choice name="early" checked={early.value === "booked"} onPick={() => early.save("booked")}>
            Bill the nights they booked
          </Choice>
          <Choice name="early" checked={early.value === "actual"} onPick={() => early.save("actual")}>
            Bill only the nights they stayed
          </Choice>
        </div>
        {early.line}
      </Card>

      <SectionTitle>Walk photos</SectionTitle>
      <Card className="flex flex-col gap-1">
        <p className="text-sm font-medium">A photo with no pets tagged</p>
        <Choice name="untagged" checked={untagged.value} onPick={() => untagged.save(true)}>
          Goes to every owner on that walk
        </Choice>
        <Choice name="untagged" checked={!untagged.value} onPick={() => untagged.save(false)}>
          Goes to no one until I tag it
        </Choice>
        {untagged.line}
      </Card>

      <SectionTitle>Getting paid</SectionTitle>
      <Card className="flex flex-col gap-3">
        <div>
          <p className="mb-1 text-sm font-medium">Ways clients can pay you</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(METHOD_LABEL)
              .filter(([k]) => k !== "other")
              .map(([k, label]) => {
                const on = methods.value.includes(k);
                return (
                  <label key={k} className={`flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm ${on ? "border-accent bg-accent text-accent-fg" : "border-border bg-bg"}`}>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      onChange={() => methods.save(on ? methods.value.filter((m) => m !== k) : [...methods.value, k])}
                      data-method={k}
                    />
                    {label}
                  </label>
                );
              })}
          </div>
          {methods.line}
        </div>
        <label>
          <span className="mb-1 block text-sm font-medium">Tip amounts clients see ($)</span>
          <Input
            value={tipText}
            inputMode="numeric"
            onChange={(e) => setTipText(e.target.value)}
            onBlur={() => {
              const list = tipText.split(/[,\s]+/).filter(Boolean).map(Number);
              if (list.join() !== tips.value.join()) tips.save(list);
            }}
            placeholder="e.g. 5, 10, 20"
            data-setting="tips"
          />
          {tips.line}
        </label>
      </Card>

      <SectionTitle>Pickups</SectionTitle>
      <Card>
        <label>
          <span className="mb-1 block text-sm font-medium">Your average driving speed (mph)</span>
          <Input
            value={etaText}
            inputMode="numeric"
            onChange={(e) => setEtaText(e.target.value)}
            onBlur={() => Number(etaText) !== eta.value && eta.save(Number(etaText))}
            data-setting="eta"
          />
          <span className="mt-1 block text-xs text-muted">Used for the &ldquo;On my way&rdquo; minutes. City driving is slower than country roads.</span>
          {eta.line}
        </label>
      </Card>
    </div>
  );
}
