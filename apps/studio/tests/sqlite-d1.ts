import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
export function sqliteD1() {
  const sqlite = new DatabaseSync(":memory:");
  const directory = new URL("../drizzle/", import.meta.url);
  for (const file of readdirSync(directory)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync(new URL(file, directory), "utf8"));
  function statement(sql: string, values: (string | number | null)[] = []) {
    return {
      bind(...args: (string | number | null)[]) {
        return statement(sql, args);
      },
      async first() {
        return sqlite.prepare(sql).get(...values) ?? null;
      },
      async all() {
        return { success: true, results: sqlite.prepare(sql).all(...values) };
      },
      async raw() {
        const query = sqlite.prepare(sql);
        query.setReturnArrays(true);
        return query.all(...values);
      },
      async run() {
        const result = sqlite.prepare(sql).run(...values);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    };
  }
  let tail: Promise<unknown> = Promise.resolve();
  const db = {
    prepare: statement,
    batch(statements: ReturnType<typeof statement>[]) {
      const pending = tail.then(async () => {
        sqlite.exec("BEGIN");
        try {
          const result = [];
          for (const s of statements) result.push(await s.run());
          sqlite.exec("COMMIT");
          return result;
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
      });
      tail = pending.catch(() => {});
      return pending;
    },
  } as unknown as D1Database;
  return { db, close: () => sqlite.close() };
}
