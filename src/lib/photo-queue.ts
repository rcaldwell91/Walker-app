"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type QueuedPhoto = { id: string; url: string; status: "done" | "uploading" | "queued" | "error" };

/** What the photos belong to: a walk, or one day's update on a boarding stay. */
export type PhotoOwner = { walkId: string } | { stayUpdateId: string };

type Pending = { id: string; ownerKey: string; owner: PhotoOwner; walkerId: string; blob: Blob; takenAt: string };

/**
 * Photos for a walk or a stay's daily update: shrunk in the browser (trail
 * uploads on one bar are slow), kept on the phone (IndexedDB) until they're
 * uploaded, then recorded as a row. A photo taken with no signal survives the
 * app being closed and uploads the next time this screen opens with signal.
 * Owners see a walk's photos only once the walk is finished (0018), and a
 * day's photos once the update is posted (0020), so uploading early is safe.
 */
export function usePhotoQueue(owner: PhotoOwner, walkerId: string, initial: QueuedPhoto[] = []) {
  const ownerKey = "walkId" in owner ? `walk:${owner.walkId}` : `stay:${owner.stayUpdateId}`;
  const [items, setItems] = useState<QueuedPhoto[]>(initial);
  const inFlight = useRef(new Set<string>());
  const tries = useRef(new Map<string, number>());
  const setStatus = (id: string, status: QueuedPhoto["status"]) => setItems((it) => it.map((x) => (x.id === id ? { ...x, status } : x)));

  const upload = useCallback(async (p: Pending) => {
    if (inFlight.current.has(p.id)) return;
    inFlight.current.add(p.id);
    setStatus(p.id, "uploading");
    try {
      const supabase = createClient();
      const folder = "walkId" in p.owner ? p.owner.walkId : `stay-${p.owner.stayUpdateId}`;
      const path = `${p.walkerId}/${folder}/${p.id}.jpg`;
      // One bar can stall an upload forever; give up after a minute and try again.
      const { error } = await withTimeout(supabase.storage.from("photos").upload(path, p.blob, { contentType: "image/jpeg", upsert: true }), 60000);
      if (error) throw error;
      // The row id doubles as the file name, so tags can refer to it before upload finishes.
      const { error: rowErr } = await supabase.from("photos").upsert({
        id: p.id,
        walker_id: p.walkerId,
        ...("walkId" in p.owner ? { walk_id: p.owner.walkId } : { stay_update_id: p.owner.stayUpdateId }),
        storage_path: path,
        taken_at: p.takenAt,
      });
      if (rowErr) throw rowErr;
      await idb("delete", p.id);
      setStatus(p.id, "done");
    } catch {
      // Still on the phone. No signal: it goes when signal returns. One bar: try twice more, then ask.
      const n = (tries.current.get(p.id) ?? 0) + 1;
      tries.current.set(p.id, n);
      if (!navigator.onLine) setStatus(p.id, "queued");
      else if (n < 3) {
        setStatus(p.id, "queued");
        setTimeout(() => upload(p), n * 5000);
      } else setStatus(p.id, "error");
    } finally {
      inFlight.current.delete(p.id);
    }
  }, []);

  // Photos left on the phone from before (no signal, app closed): show them and send them.
  useEffect(() => {
    let alive = true;
    const resume = async () => {
      const left = ((await idb("all")) as Pending[] | null)?.filter((p) => p.ownerKey === ownerKey) ?? [];
      if (!alive || !left.length) return;
      setItems((it) => {
        const known = new Set(it.map((x) => x.id));
        return [...it, ...left.filter((p) => !known.has(p.id)).map((p) => ({ id: p.id, url: URL.createObjectURL(p.blob), status: "queued" as const }))];
      });
      if (navigator.onLine) left.forEach(upload);
    };
    resume();
    window.addEventListener("online", resume);
    return () => {
      alive = false;
      window.removeEventListener("online", resume);
    };
  }, [ownerKey, upload]);

  function add(files: FileList | File[] | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      const id = crypto.randomUUID();
      setItems((it) => [...it, { id, url: URL.createObjectURL(file), status: "uploading" }]);
      (async () => {
        const p: Pending = { id, ownerKey, owner, walkerId, blob: await shrink(file), takenAt: new Date(file.lastModified || Date.now()).toISOString() };
        await idb("put", p); // kept on the phone first, so nothing is lost if the app closes
        await upload(p);
      })();
    }
  }

  /** Try a photo that didn't send again. */
  async function retry(id: string) {
    const p = ((await idb("all")) as Pending[] | null)?.find((x) => x.id === id);
    tries.current.delete(id);
    if (p) await upload(p);
  }

  const pending = items.filter((i) => i.status === "uploading" || i.status === "queued").length;
  return { items, add, retry, pending };
}

/**
 * Mounted once in the walker app: photos still on the phone from any walk or
 * stay (the walker moved on, or the app closed) go up when there's signal.
 */
export function PendingPhotoSender() {
  useEffect(() => {
    let busy = false;
    const send = async () => {
      if (busy || !navigator.onLine) return;
      busy = true;
      try {
        for (const p of ((await idb("all")) as Pending[] | null) ?? []) {
          try {
            const supabase = createClient();
            const folder = "walkId" in p.owner ? p.owner.walkId : `stay-${p.owner.stayUpdateId}`;
            const path = `${p.walkerId}/${folder}/${p.id}.jpg`;
            const { error } = await withTimeout(supabase.storage.from("photos").upload(path, p.blob, { contentType: "image/jpeg", upsert: true }), 60000);
            if (error) continue;
            const { error: rowErr } = await supabase.from("photos").upsert({
              id: p.id,
              walker_id: p.walkerId,
              ...("walkId" in p.owner ? { walk_id: p.owner.walkId } : { stay_update_id: p.owner.stayUpdateId }),
              storage_path: path,
              taken_at: p.takenAt,
            });
            if (!rowErr) await idb("delete", p.id);
          } catch {
            /* next time */
          }
        }
      } finally {
        busy = false;
      }
    };
    const t = setTimeout(send, 5000); // after the screen has what it needs
    const every = setInterval(send, 120000);
    window.addEventListener("online", send);
    return () => {
      clearTimeout(t);
      clearInterval(every);
      window.removeEventListener("online", send);
    };
  }, []);
  return null;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timed out")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Tiny IndexedDB wrapper. Returns null where storage is blocked (private mode): photos then live in memory only. */
function idb(op: "put" | "delete" | "all", arg?: Pending | string): Promise<unknown> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open("walker-photos", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("pending", { keyPath: "id" });
      open.onerror = () => resolve(null);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction("pending", op === "all" ? "readonly" : "readwrite");
        const store = tx.objectStore("pending");
        const req = op === "put" ? store.put(arg) : op === "delete" ? store.delete(arg as string) : store.getAll();
        req.onsuccess = () => resolve(op === "all" ? req.result : true);
        req.onerror = () => resolve(null);
        tx.oncomplete = () => db.close();
      };
    } catch {
      resolve(null);
    }
  });
}

export async function shrink(file: File, max = 1600): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.85));
  } catch {
    return file; // an image the browser can't read to shrink: send it as it is
  }
}
