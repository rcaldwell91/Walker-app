"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Select } from "@/components/ui";

type Item = { id: string; url: string; caption: string | null; status: "done" | "uploading" | "queued" | "error" };

/**
 * Picks photos from the camera or roll, shrinks them in the browser (trail
 * uploads on one bar are slow), uploads to Storage, and records a row.
 * Anything that fails while offline is retried when the connection returns.
 */
export function PhotoUploader({
  walkId,
  walkerId,
  dogs,
  existing,
}: {
  walkId: string;
  walkerId: string;
  dogs: { id: string; name: string }[];
  existing: { id: string; url: string; caption: string | null }[];
}) {
  const [items, setItems] = useState<Item[]>(existing.map((e) => ({ ...e, status: "done" })));
  const [dogId, setDogId] = useState<string>(dogs.length === 1 ? dogs[0].id : "");
  const inputRef = useRef<HTMLInputElement>(null);
  const retry = useRef<(() => void)[]>([]);

  async function onFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      const localId = crypto.randomUUID();
      const url = URL.createObjectURL(file);
      setItems((it) => [{ id: localId, url, caption: null, status: "uploading" }, ...it]);
      const doUpload = async () => {
        try {
          const blob = await shrink(file);
          const supabase = createClient();
          const path = `${walkerId}/${walkId}/${localId}.jpg`;
          const { error } = await supabase.storage.from("photos").upload(path, blob, { contentType: "image/jpeg", upsert: true });
          if (error) throw error;
          const { error: rowErr } = await supabase.from("photos").insert({
            walker_id: walkerId,
            walk_id: walkId,
            dog_id: dogId || null,
            storage_path: path,
            taken_at: new Date(file.lastModified).toISOString(),
          });
          if (rowErr) throw rowErr;
          setItems((it) => it.map((x) => (x.id === localId ? { ...x, status: "done" } : x)));
        } catch {
          if (!navigator.onLine) {
            setItems((it) => it.map((x) => (x.id === localId ? { ...x, status: "queued" } : x)));
            retry.current.push(doUpload);
            window.addEventListener("online", flushRetries, { once: true });
          } else {
            setItems((it) => it.map((x) => (x.id === localId ? { ...x, status: "error" } : x)));
          }
        }
      };
      doUpload();
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  function flushRetries() {
    const fns = retry.current.splice(0);
    fns.forEach((f) => f());
  }

  return (
    <div className="flex flex-col gap-3">
      {dogs.length > 1 ? (
        <Select value={dogId} onChange={(e) => setDogId(e.target.value)}>
          <option value="">Whole group</option>
          {dogs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      ) : null}
      <input ref={inputRef} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={(e) => onFiles(e.target.files)} />
      <Button type="button" onClick={() => inputRef.current?.click()}>
        Add photos
      </Button>
      <ul className="grid grid-cols-3 gap-2">
        {items.map((p) => (
          <li key={p.id} className="relative aspect-square overflow-hidden rounded-xl bg-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.caption ?? ""} className="h-full w-full object-cover" />
            {p.status !== "done" ? (
              <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-center text-[10px] text-white">
                {p.status === "uploading" ? "Uploading…" : p.status === "queued" ? "Will send when online" : "Failed"}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

async function shrink(file: File, max = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.85));
}
