import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { briefs } from "../db/schema";
import { briefInput, briefId } from "./briefs";
export class BriefConflictError extends Error {
  constructor() {
    super("This request ID was already used with different brief fields. Use a new request ID for a new brief.");
  }
}
function publicBrief(row: typeof briefs.$inferSelect) {
  const { owner, requestId, ...result } = row;
  void owner;
  void requestId;
  return result;
}
export async function listBriefs(owner: string) {
  return getDb()
    .select({
      id: briefs.id,
      title: briefs.title,
      track: briefs.track,
      createdAt: briefs.createdAt,
    })
    .from(briefs)
    .where(eq(briefs.owner, owner))
    .orderBy(desc(briefs.createdAt))
    .limit(50);
}
export async function getBrief(owner: string, id: unknown) {
  const key = briefId.parse(id);
  const rows = await getDb()
    .select()
    .from(briefs)
    .where(and(eq(briefs.id, key), eq(briefs.owner, owner)))
    .limit(1);
  if (!rows[0]) throw new Error("Brief not found.");
  return publicBrief(rows[0]);
}
export async function createBrief(owner: string, input: unknown) {
  const data = briefInput.parse(input);
  await getDb()
    .insert(briefs)
    .values({
      ...data,
      id: crypto.randomUUID(),
      owner,
      createdAt: new Date().toISOString(),
    })
    .onConflictDoNothing({ target: [briefs.owner, briefs.requestId] });
  const rows = await getDb()
    .select()
    .from(briefs)
    .where(and(eq(briefs.owner, owner), eq(briefs.requestId, data.requestId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error("Brief not found.");
  if (Object.entries(data).some(([key, value]) => row[key as keyof typeof data] !== value))
    throw new BriefConflictError();
  return publicBrief(row);
}
