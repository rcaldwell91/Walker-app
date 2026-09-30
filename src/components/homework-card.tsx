"use client";

import { markHomework } from "@/app/my/actions";
import { Card } from "@/components/ui";
import { ActionButton } from "@/components/action-button";

export function HomeworkCard({
  hw,
}: {
  hw: { id: string; title: string; instructions: string | null; status: string; due_at: string | null; dogName: string };
}) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-muted">{hw.dogName}</p>
      <p className="font-medium">{hw.title}</p>
      {hw.instructions ? <p className="mt-1 text-sm text-muted">{hw.instructions}</p> : null}
      <div className="mt-3 flex gap-2">
        {hw.status === "assigned" ? (
          <span className="flex-1">
            <ActionButton variant="secondary" className="w-full" run={() => markHomework(hw.id, "in_progress")}>
              We&apos;re on it
            </ActionButton>
          </span>
        ) : null}
        <span className="flex-1">
          <ActionButton className="w-full" run={() => markHomework(hw.id, "done")}>
            Done
          </ActionButton>
        </span>
      </div>
    </Card>
  );
}
