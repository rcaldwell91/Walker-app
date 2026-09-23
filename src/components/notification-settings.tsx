import Link from "next/link";
import { PUSH_KINDS } from "@/lib/push-kinds";
import { setNotifyOff } from "@/app/push-actions";
import { Button, Card } from "@/components/ui";
import { ThisDevicePush } from "./this-device-push";

/** Push settings: which kinds, plus this device on/off. */
export function NotificationSettings({ role, off }: { role: "walker" | "client"; off: string[] }) {
  const kinds = PUSH_KINDS.filter((k) => k.roles.includes(role));
  return (
    <Card className="flex flex-col gap-3" data-notification-settings>
      <ThisDevicePush />
      <form action={setNotifyOff} className="flex flex-col gap-2">
        <p className="text-sm font-medium">Send me a notification for</p>
        {kinds.map((k) => (
          <label key={k.key} className="flex items-center gap-3 text-sm">
            <input type="checkbox" name="on" value={k.key} defaultChecked={!off.includes(k.key)} className="h-5 w-5" data-kind={k.key} />
            {k.label}
          </label>
        ))}
        <Button type="submit" variant="secondary">
          Save notification settings
        </Button>
      </form>
      <Link href="/install" className="text-sm text-accent underline">
        How to add to home screen
      </Link>
    </Card>
  );
}
