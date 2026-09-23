"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, ErrorText } from "@/components/ui";
import { setAvatar, setBackgroundCheck } from "./actions";

/** Profile photo → avatars/{userId}/avatar-<time>.jpg (public bucket). */
export function AvatarUpload({ userId, current, name }: { userId: string; current: string | null; name: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(current);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await square(file);
      const supabase = createClient();
      const path = `${userId}/avatar-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      const res = await setAvatar(url);
      if (res.error) throw new Error(res.error);
      setPreview(url);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="h-20 w-20 shrink-0 rounded-full object-cover" data-avatar />
      ) : (
        <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-border text-2xl font-semibold text-muted">
          {name.trim()[0]?.toUpperCase() ?? "?"}
        </span>
      )}
      <div className="flex-1">
        <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} data-avatar-input />
        <Button type="button" variant="secondary" className="w-full" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Uploading…" : preview ? "Change photo" : "Add a photo"}
        </Button>
        <ErrorText>{error}</ErrorText>
      </div>
    </div>
  );
}

/** Background-check proof → documents/{userId}/background-check-<time>.<ext> (private bucket). */
export function BackgroundCheckUpload({ userId, hasFile }: { userId: string; hasFile: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return setError("That file is over 10 MB. Try a smaller scan or a photo.");
    setBusy(true);
    setError(null);
    try {
      const ext = (file.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "pdf";
      const path = `${userId}/background-check-${Date.now()}.${ext}`;
      const { error: upErr } = await createClient().storage.from("documents").upload(path, file, { contentType: file.type || undefined });
      if (upErr) throw upErr;
      const res = await setBackgroundCheck(path);
      if (res.error) throw new Error(res.error);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <input ref={input} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} data-proof-input />
      <Button type="button" variant="secondary" className="w-full" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "Uploading…" : hasFile ? "Upload a newer one" : "Upload proof"}
      </Button>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

/** Center-crop to a square and shrink, so avatars stay small. */
async function square(file: File, size = 512): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(size, s);
  canvas.getContext("2d")!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.85));
}
