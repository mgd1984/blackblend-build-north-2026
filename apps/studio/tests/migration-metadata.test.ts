import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
  type DrizzleSQLiteSnapshotJSON,
} from "drizzle-kit/api";
import * as schema from "../db/schema.ts";
const dir = new URL("../drizzle/", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, dir), "utf8");
const snapshot = (index: number) =>
  JSON.parse(
    read(`meta/${String(index).padStart(4, "0")}_snapshot.json`),
  ) as DrizzleSQLiteSnapshotJSON;

test("journal covers every Wrangler migration and snapshot history ends at the actual schema", async () => {
  const journal = JSON.parse(read("meta/_journal.json")) as {
    entries: { idx: number; tag: string }[];
  };
  assert.deepEqual(
    journal.entries.map((e) => e.tag + ".sql"),
    readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort(),
  );
  for (const entry of journal.entries) {
    const current = snapshot(entry.idx);
    if (entry.idx > 0) assert.equal(current.prevId, snapshot(entry.idx - 1).id);
  }
  const latest = snapshot(7),
    actual = await generateSQLiteDrizzleJson(schema, latest.id);
  assert.deepEqual(
    await generateSQLiteMigration(latest, actual),
    [],
    "db:generate must not recreate native_geometry",
  );
});

test("native snapshots reproduce the existing migrations without changing initialized databases", async () => {
  const existing = new DatabaseSync(":memory:"),
    generated = new DatabaseSync(":memory:");
  try {
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const f of files) existing.exec(read(f));
    for (const f of files.slice(0, 6)) generated.exec(read(f));
    for (const index of [6, 7]) {
      for (const sql of await generateSQLiteMigration(snapshot(index - 1), snapshot(index)))
        generated.exec(sql);
    }
    for (const query of [
      "PRAGMA table_info('native_geometry')",
      "PRAGMA index_list('native_geometry')",
      "PRAGMA index_info('native_geometry_owner_request')",
      "PRAGMA index_info('native_geometry_owner_created')",
    ]) {
      assert.deepEqual(generated.prepare(query).all(), existing.prepare(query).all());
    }
  } finally {
    existing.close();
    generated.close();
  }
});
