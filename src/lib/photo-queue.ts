"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type QueuedPhoto = { id: string; url: string; status: "done" | "uploading" | "queued" | "error" };

/** What the photos belong to: a walk, or one day's update on a boarding stay. */
export type PhotoOwner = { walkId: string } | { stayUpdateId: string };

/**
 * Photos for a walk or a stay's daily update: shrunk in the browser (trail uploads on one bar are slow),
 * uploaded to Storage, and recorded as a row. Anything that fails while offline
 * is retried when the connection returns. Owners see a walk's photos only once
 * the walk is finished (0018), and a day's photos once the update is posted
 * (0020), so uploading early is safe.
 */
export function usePhotoQueue(owner: PhotoOwner, walkerId: string, initial: QueuedPhoto[] = []) {
  const [items, setItems] = useState<QueuedPhoto[]>(initial);
  const retry = useRef<(() => void)[]>([]);

  function flushRetries() {
    retry.current.splice(0).forEach((f) => f());
  }

  function add(files: FileList | File[] | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      // The row id doubles as the file name, so tags can refer to it before upload finishes.
      const id = crypto.randomUUID();
      const url = URL.createObjectURL(file);
      setItems((it) => [...it, { id, url, status: "uploading" }]);
      const doUpload = async () => {
        try {
          const blob = await shrink(file);
          const supabase = createClient();
          const folder = "walkId" in owner ? owner.walkId : `stay-${owner.stayUpdateId}`;
          const path = `${walkerId}/${folder}/${id}.jpg`;
          const { error } = await supabase.storage.from("photos").upload(path, blob, { contentType: "image/jpeg", upsert: true });
          if (error) throw error;
          const { error: rowErr } = await supabase
            .from("photos")
            .upsert({
              id,
              walker_id: walkerId,
              ...("walkId" in owner ? { walk_id: owner.walkId } : { stay_update_id: owner.stayUpdateId }),
              storage_path: path,
              taken_at: new Date(file.lastModified).toISOString(),
            });
          if (rowErr) throw rowErr;
          setItems((it) => it.map((x) => (x.id === id ? { ...x, status: "done" } : x)));
        } catch {
          if (!navigator.onLine) {
            setItems((it) => it.map((x) => (x.id === id ? { ...x, status: "queued" } : x)));
            retry.current.push(doUpload);
            window.addEventListener("online", flushRetries, { once: true });
          } else {
            setItems((it) => it.map((x) => (x.id === id ? { ...x, status: "error" } : x)));
          }
        }
      };
      doUpload();
    }
  }

  const pending = items.filter((i) => i.status === "uploading" || i.status === "queued").length;
  return { items, add, pending };
}

export async function shrink(file: File, max = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.85));
}
