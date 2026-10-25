import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { scenes } from "../db/schema";
import { sceneDocument } from "./scene-document";

export const saveSceneInput = z
  .object({
    id: z.string().uuid(),
    expectedVersion: z.number().int().min(0),
    document: sceneDocument,
  })
  .strict();
export function readScene(row: typeof scenes.$inferSelect) {
  return {
    id: row.id,
    version: row.version,
    document: sceneDocument.parse(JSON.parse(row.document)),
    updatedAt: row.updatedAt,
  };
}
export async function listScenes(owner: string) {
  const rows = await getDb()
    .select({
      id: scenes.id,
      title: scenes.title,
      version: scenes.version,
      updatedAt: scenes.updatedAt,
    })
    .from(scenes)
    .where(eq(scenes.owner, owner))
    .orderBy(desc(scenes.updatedAt))
    .limit(50);
  return rows;
}
export async function getScene(owner: string, id: string) {
  z.string().uuid().parse(id);
  const [row] = await getDb()
    .select()
    .from(scenes)
    .where(and(eq(scenes.owner, owner), eq(scenes.id, id)))
    .limit(1);
  return row ? readScene(row) : null;
}
export async function saveScene(owner: string, input: unknown) {
  const data = saveSceneInput.parse(input),
    db = getDb();
  const values = {
    title: data.document.title,
    document: JSON.stringify(data.document),
    updatedAt: new Date().toISOString(),
  };
  if (data.expectedVersion === 0) {
    const rows = await db
      .insert(scenes)
      .values({ ...values, id: data.id, owner, version: 1, createdAt: values.updatedAt })
      .onConflictDoNothing()
      .returning();
    if (rows[0]) return readScene(rows[0]);
  } else {
    const rows = await db
      .update(scenes)
      .set({ ...values, version: data.expectedVersion + 1 })
      .where(
        and(
          eq(scenes.id, data.id),
          eq(scenes.owner, owner),
          eq(scenes.version, data.expectedVersion),
        ),
      )
      .returning();
    if (rows[0]) return readScene(rows[0]);
  }
  throw Error("SCENE_CONFLICT");
}
