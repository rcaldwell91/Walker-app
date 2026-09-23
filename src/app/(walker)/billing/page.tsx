import { PageTitle, Card, LinkButton } from "@/components/ui";

export default function Page() {
  return (
    <>
      <PageTitle>Plan and fees</PageTitle>
      <Card className="mb-4">
        <p className="font-medium">Every feature, for every walker.</p>
        <p className="mt-1 text-sm text-muted">There&apos;s no charge for using the app right now. If that changes, you&apos;ll hear about it here first.</p>
      </Card>
      <LinkButton href="/money" variant="secondary" className="w-full">
        Billing your clients → Money
      </LinkButton>
    </>
  );
}
