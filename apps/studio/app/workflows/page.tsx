import { redirect } from "next/navigation";
import { legacyWorkflowUrl } from "../../lib/studio-location";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(legacyWorkflowUrl(await searchParams));
}
