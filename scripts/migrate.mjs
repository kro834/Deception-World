#!/usr/bin/env node
/**
 * Deploy-time database migrator (node-postgres, `pg`).
 *
 * Runs during `npm run build` — on every Vercel deploy — applying pending files
 * in ../migrations to DATABASE_URL. Destructive files are deferred unless the
 * verified release workflow explicitly opts in. Each applied file runs in one
 * transaction and is recorded in `_migrations`, so it is safe to re-run.
 *
 * No DATABASE_URL (local / preview builds) -> skip; the PGLite fallback applies
 * the same files at startup instead (see src/lib/db.ts).
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

export const DESTRUCTIVE_MIGRATIONS = new Set(["0004_retire_archive_ai.sql"]);

export function destructiveMigrationsEnabled(
  value = process.env.APPLY_DESTRUCTIVE_MIGRATIONS,
) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized === "0") return false;
  if (normalized === "1") return true;
  throw new Error("APPLY_DESTRUCTIVE_MIGRATIONS must be exactly 0 or 1");
}

export function shouldApplyMigration(name, applyDestructiveMigrations) {
  return (
    !DESTRUCTIVE_MIGRATIONS.has(name) || applyDestructiveMigrations === true
  );
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      "[migrate] DATABASE_URL not set — skipping (the PGLite fallback migrates itself).",
    );
    return;
  }
  const applyDestructiveMigrations = destructiveMigrationsEnabled();
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  let migrationLockHeld = false;
  try {
    // Vercel can build more than one immutable candidate against the same
    // Production database. Serialize schema changes so concurrent builds
    // cannot both decide that the same migration is pending.
    await client.query("SELECT pg_advisory_lock(hashtext('deception-world:migrations'))");
    migrationLockHeld = true;
    await client.query(
      "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    const applied = new Set(
      (await client.query("SELECT name FROM _migrations")).rows.map((r) => r.name),
    );

    let files;
    try {
      files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
    } catch {
      console.log("[migrate] no migrations/ directory — nothing to do.");
      return;
    }

    let count = 0;
    for (const name of files) {
      if (applied.has(name)) continue;
      if (!shouldApplyMigration(name, applyDestructiveMigrations)) {
        console.log(
          `[migrate] deferred destructive migration ${name}; set APPLY_DESTRUCTIVE_MIGRATIONS=1 only after the compatible release is live`,
        );
        continue;
      }
      const text = await readFile(join(migrationsDir, name), "utf8");
      try {
        await client.query("BEGIN");
        // pg's simple-query protocol runs a whole multi-statement file at once.
        await client.query(text);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
        await client.query("COMMIT");
      } catch (err) {
        console.error(`[migrate] error applying ${name}`);
        try {
          await client.query("ROLLBACK");
        } catch {
          // ROLLBACK fails when the connection died — keep the original error.
        }
        throw err;
      }
      console.log(`[migrate] applied ${name}`);
      count += 1;
    }
    console.log(count ? `[migrate] done — ${count} migration(s) applied.` : "[migrate] up to date.");
  } finally {
    if (migrationLockHeld) {
      try {
        await client.query("SELECT pg_advisory_unlock(hashtext('deception-world:migrations'))");
      } catch {
        // A dead connection releases its session-scoped advisory lock itself.
      }
    }
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("[migrate] failed:", err?.message || err);
    // pg errors carry the context needed to debug a bad SQL file.
    for (const key of ["code", "detail", "hint", "position", "where"]) {
      if (err?.[key] != null) console.error(`[migrate]   ${key}: ${err[key]}`);
    }
    process.exitCode = 1;
  });
}
