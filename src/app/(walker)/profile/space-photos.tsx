"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { shrink } from "@/lib/photo-queue";
import { Button, ErrorText, Input } from "@/components/ui";
import { addSpacePhoto, removeSpacePhoto } from "./actions";

/**
 * Photos of the walker's boarding space → avatars/{userId}/space-<time>.jpg
 * (public bucket). Shown on the public page and to clients looking at a stay.
 */
export function SpacePhotos({ userId, photos }: { userId: string; photos: { id: string; url: string; caption: string | null }[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const list = Array.from(files);
    try {
      for (let i = 0; i < list.length; i++) {
        setBusy(`Uploading ${i + 1} of ${list.length}…`);
        const blob = await shrink(list[i]);
        const path = `${userId}/space-${Date.now()}-${i}.jpg`;
        const { error: upErr } = await createClient().storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
        if (upErr) throw upErr;
        const res = await addSpacePhoto(path, caption);
        if (res.error) throw Object.assign(new Error(res.error), { plain: true });
      }
      setCaption("");
      router.refresh();
    } catch (e) {
      // Our own lines (already plain) show as they are; anything technical becomes one plain line.
      setError(e instanceof Error && "plain" in e ? e.message : navigator.onLine ? "Upload failed. Try again." : "No signal. Try again when you have a bar.");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-3" data-space-gallery>
      {photos.length ? (
        <ul className="grid grid-cols-2 gap-2">
          {photos.map((p) => (
            <li key={p.id} className="relative" data-space-photo>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.caption ?? "Your space"} className="aspect-square w-full rounded-xl object-cover" />
              {p.caption ? <p className="mt-1 text-xs text-muted">{p.caption}</p> : null}
              <form noValidate action={removeSpacePhoto.bind(null, p.id)} className="absolute right-1 top-1">
                <button aria-label="Remove photo" className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-lg text-white">
                  ×
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Show clients where their pet will stay: the yard, the beds, the couch.</p>
      )}
      <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption (optional), e.g. Fenced back yard" maxLength={120} aria-label="Caption" />
      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} data-space-input />
      <Button type="button" variant="secondary" disabled={!!busy} onClick={() => input.current?.click()}>
        {busy ?? "Add photos of your space"}
      </Button>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
