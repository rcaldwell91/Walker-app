"use client";

import { useTransition } from "react";
import { markHomework } from "@/app/my/actions";
import { Button, Card } from "@/components/ui";

export function HomeworkCard({
  hw,
}: {
  hw: { id: string; title: string; instructions: string | null; status: string; due_at: string | null; dogName: string };
}) {
  const [pending, start] = useTransition();
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-muted">{hw.dogName}</p>
      <p className="font-medium">{hw.title}</p>
      {hw.instructions ? <p className="mt-1 text-sm text-muted">{hw.instructions}</p> : null}
      <div className="mt-3 flex gap-2">
        {hw.status === "assigned" ? (
          <Button
            variant="secondary"
            className="flex-1"
            disabled={pending}
            onClick={() => start(() => markHomework(hw.id, "in_progress"))}
          >
            We&apos;re on it
          </Button>
        ) : null}
        <Button className="flex-1" disabled={pending} onClick={() => start(() => markHomework(hw.id, "done"))}>
          Done
        </Button>
      </div>
    </Card>
  );
}
