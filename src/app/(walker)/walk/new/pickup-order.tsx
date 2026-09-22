"use client";

import { useRef } from "react";

export type PickupRow = { id: string; name: string; color: string | null; detail: string };

/**
 * Numbered pickup list. In reorder mode each row has a handle: drag it (finger
 * or mouse) or focus it and use the arrow keys.
 */
export function PickupOrder({
  rows,
  reordering,
  onMove,
}: {
  rows: PickupRow[];
  reordering: boolean;
  onMove: (from: number, to: number) => void;
}) {
  const list = useRef<HTMLOListElement>(null);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;

  function startDrag(e: React.PointerEvent, index: number) {
    e.preventDefault();
    const rowEls = list.current?.children;
    if (!rowEls?.length) return;
    const step = rowEls.length > 1
      ? (rowEls[1] as HTMLElement).getBoundingClientRect().top - (rowEls[0] as HTMLElement).getBoundingClientRect().top
      : (rowEls[0] as HTMLElement).getBoundingClientRect().height;
    let at = index;
    let anchorY = e.clientY;
    const count = rowEls.length;

    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - anchorY;
      if (dy > step / 2 && at < count - 1) {
        moveRef.current(at, at + 1);
        at += 1;
        anchorY += step;
      } else if (dy < -step / 2 && at > 0) {
        moveRef.current(at, at - 1);
        at -= 1;
        anchorY -= step;
      }
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  return (
    <ol ref={list} className="flex flex-col gap-2" aria-label="Pickup order">
      {rows.map((r, i) => (
        <li key={r.id} data-stop={r.name} className="flex items-center gap-3 rounded-xl border border-border bg-bg px-3 py-2">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ background: r.color ?? "#6b6960" }}
          >
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{r.name}</p>
            <p className="truncate text-xs text-muted">{r.detail}</p>
          </div>
          {reordering ? (
            <button
              type="button"
              aria-label={`Move ${r.name}. Drag, or use the arrow keys.`}
              className="flex w-11 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded-lg text-xl text-muted active:cursor-grabbing"
              onPointerDown={(e) => startDrag(e, i)}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp" && i > 0) {
                  e.preventDefault();
                  onMove(i, i - 1);
                } else if (e.key === "ArrowDown" && i < rows.length - 1) {
                  e.preventDefault();
                  onMove(i, i + 1);
                }
              }}
            >
              ≡
            </button>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
