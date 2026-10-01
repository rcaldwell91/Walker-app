"use client";

import { useActionState, useEffect, useState } from "react";
import { bookStay } from "../actions";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { VoiceInput } from "@/components/voice-input";
import { dayDiff, stayPrice } from "@/lib/boarding";
import { cents } from "@/lib/format";

type Client = { id: string; name: string; pets: { id: string; name: string }[] };

export function BookStayForm({
  clients,
  initialClient,
  initialPet,
  startDay,
  endDay,
  nightCents,
  extraCents,
  dropoffTime,
  pickupTime,
}: {
  dropoffTime: string;
  pickupTime: string;
  clients: Client[];
  initialClient: string;
  initialPet: string;
  startDay: string;
  endDay: string;
  nightCents: number | null;
  extraCents: number | null;
}) {
  const [state, action, pending] = useActionState(bookStay, undefined);
  // A warning is about what was on screen when it was checked: any change takes it away.
  const [warn, setWarn] = useState(false);
  useEffect(() => setWarn(!!state?.warning), [state]);
  const [clientId, setClientId] = useState(initialClient);
  const client = clients.find((c) => c.id === clientId);
  const [pets, setPets] = useState<string[]>(() => {
    const c = clients.find((x) => x.id === initialClient);
    if (!c) return [];
    if (initialPet && c.pets.some((p) => p.id === initialPet)) return [initialPet];
    return c.pets.length === 1 ? [c.pets[0].id] : [];
  });
  const [start, setStart] = useState(startDay);
  const [end, setEnd] = useState(endDay);
  const [startTime, setStartTime] = useState(dropoffTime);
  const [endTime, setEndTime] = useState(pickupTime);
  const [notes, setNotes] = useState("");
  // Controlled fields: a "Book anyway" warning mustn't wipe what was typed.
  const [price, setPrice] = useState<string | null>(null); // null = use the rates
  const nights = Math.max(0, dayDiff(start || startDay, end || endDay));
  const computed = stayPrice(nights, pets.length, nightCents ?? 0, extraCents ?? 0);
  const shownPrice = price ?? (nightCents != null && pets.length && nights ? (computed / 100).toFixed(2).replace(/\.00$/, "") : "");

  return (
    <form noValidate action={action} className="flex flex-col gap-4" onChange={() => setWarn(false)}>
      <Card className="flex flex-col gap-4">
        <Field label="Client">
          <Select
            name="client_id"
            value={clientId}
            onChange={(e) => {
              const c = clients.find((x) => x.id === e.target.value);
              setClientId(e.target.value);
              setPets(c && c.pets.length === 1 ? [c.pets[0].id] : []);
            }}
            required
            data-client-select
          >
            <option value="">Pick a client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        {client ? (
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Pets</legend>
            {client.pets.length ? (
              <div className="flex flex-wrap gap-2">
                {client.pets.map((p) => {
                  const on = pets.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 ${on ? "border-accent bg-accent text-accent-fg" : "border-border bg-bg"}`}
                    >
                      <input
                        type="checkbox"
                        name="pet"
                        value={p.id}
                        checked={on}
                        onChange={() => setPets(on ? pets.filter((x) => x !== p.id) : [...pets, p.id])}
                        className="sr-only"
                        data-pet={p.name}
                      />
                      {p.name}
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted">No pets on file for {client.name} yet. Add one on their page first.</p>
            )}
          </fieldset>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Drop-off day">
            <Input type="date" name="start_day" value={start} onChange={(e) => setStart(e.target.value)} required data-start-day />
          </Field>
          <Field label="Time">
            <Input type="time" name="start_time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          </Field>
          <Field label="Pick-up day">
            <Input type="date" name="end_day" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required data-end-day />
          </Field>
          <Field label="Time">
            <Input type="time" name="end_time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
          </Field>
        </div>
        <p className="text-sm text-muted" data-nights={nights}>
          {nights ? `${nights} night${nights === 1 ? "" : "s"}` : "Pick-up is at least one night after drop-off."}
        </p>
      </Card>

      <Card className="flex flex-col gap-2">
        <Field label="Price ($)">
          <Input
            name="price"
            inputMode="decimal"
            value={shownPrice}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={nightCents == null ? "Set your nightly rate in My rates, or type a price" : "e.g. 150"}
            data-price
          />
        </Field>
        <p className="text-xs text-muted">
          {nightCents == null
            ? "No nightly rate set yet."
            : `${cents(nightCents)} a night${pets.length > 1 ? ` + ${cents(extraCents ?? 0)} for each extra pet` : ""}. Change the price if this stay is different.`}
          {price !== null ? (
            <>
              {" "}
              <button type="button" className="text-accent underline" onClick={() => setPrice(null)}>
                Use my rates
              </button>
            </>
          ) : null}
        </p>
      </Card>

      <Field label="Notes (optional)">
        <VoiceInput name="notes" value={notes} onValueChange={setNotes} rows={2} placeholder="e.g. Bringing own bed" />
      </Field>

      {/* Over capacity or away: the same button turns into "Book anyway", right where the thumb is. */}
      {warn ? (
        <Button type="submit" name="force" value="1" variant="danger" disabled={pending} className="h-14 text-lg" data-book-anyway>
          {pending ? "Booking…" : "Book anyway"}
        </Button>
      ) : (
        <Button type="submit" disabled={pending} className="h-14 text-lg" data-book>
          {pending ? "Booking…" : "Book stay"}
        </Button>
      )}
      <p className={`min-h-10 text-sm ${state?.error || warn ? "text-warn" : "text-muted"}`} role="status" data-capacity-warning={warn ? "" : undefined}>
        {state?.error ?? (warn ? state?.warning : "")}
      </p>
    </form>
  );
}
