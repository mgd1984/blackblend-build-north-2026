import Studio from "./studio";
import { readStudioLocation } from "../../lib/studio-location";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const values = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["project", "flow", "view", "example"])
    if (typeof values[key] === "string") query.set(key, values[key]);
  return <Studio initialRoute={readStudioLocation(query.toString())} />;
}
