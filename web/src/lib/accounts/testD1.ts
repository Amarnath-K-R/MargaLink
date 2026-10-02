/// <reference types="@cloudflare/workers-types" />
// A stand-in for Cloudflare D1 over Node's built-in SQLite, for selfchecks
// only (never imported by the app): an in-memory database with every
// migration applied, answering the prepare/bind/first/all/run/batch calls
// the Functions make. Like D1, batch() is one transaction and foreign keys
// are on. Everything runs synchronously underneath, so a batch can't
// interleave with another call, as D1's serialized writes can't.
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";

export function testD1(): D1Database {
  const db = new DatabaseSync(":memory:");
  const dir = new URL("../../../migrations/", import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(new URL(f, dir), "utf8"));

  type Row = Record<string, unknown>;
  const plain = (rows: unknown[]) => rows.map((r) => ({ ...(r as Row) })); // node:sqlite rows have a null prototype
  const exec = (sql: string, args: SQLInputValue[]) => {
    const s = db.prepare(sql);
    if (s.columns().length) {
      // a SELECT, or a write with RETURNING: D1 answers with its rows
      const rows = plain(s.all(...args));
      return { results: rows, success: true, meta: { changes: rows.length, last_row_id: 0 } };
    }
    const r = s.run(...args);
    return { results: [] as Row[], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  };
  const stmt = (sql: string, args: SQLInputValue[] = []) => ({
    sql,
    args,
    bind: (...a: SQLInputValue[]) => stmt(sql, a),
    first: async (col?: string) => {
      const row = db.prepare(sql).get(...args) as Row | undefined;
      return row === undefined ? null : col ? (row[col] ?? null) : { ...row };
    },
    all: async () => ({ results: plain(db.prepare(sql).all(...args)), success: true, meta: {} }),
    run: async () => exec(sql, args),
  });
  const d1 = {
    prepare: (sql: string) => stmt(sql),
    batch: async (stmts: ReturnType<typeof stmt>[]) => {
      db.exec("BEGIN");
      try {
        const out = stmts.map((s) => exec(s.sql, s.args));
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    exec: async (sql: string) => {
      db.exec(sql);
      return { count: 0, duration: 0 };
    },
  };
  return d1 as unknown as D1Database;
}
