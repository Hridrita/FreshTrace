/**
 * Vitest global setup — runs exactly once, before any test worker starts.
 *
 * The test database and its Prisma client have to be prepared before the
 * workers begin, and the preparation is not something several workers can
 * safely do at once: `prisma generate` writes into a single output
 * directory, and two processes doing that at the same time produce a
 * half-written client.
 *
 * So the work happens here — once — and `tests/setup.js` is left with only
 * the per-worker environment setup.
 *
 * The app's real database is PostgreSQL (Neon), and the generated Prisma
 * client is provider-specific — a PostgreSQL client cannot open a SQLite
 * connection. So the test run uses a *second* generated client, built from
 * `prisma/schema.sqlite.prisma` into `src/generated/prisma-sqlite`. Both
 * schema files are derived from the canonical `prisma/schema.prisma` by
 * `scripts/make-test-schema.mjs`, so the models cannot drift apart.
 */
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testDbPath = path.join(rootDir, "prisma", "dev.test.db");
const sqliteSchemaPath = path.join(rootDir, "prisma", "schema.sqlite.prisma");

// The Prisma CLI is invoked through its JS entry point rather than `npx`, so
// this works the same way on Windows, macOS and Linux without depending on
// shell shims (`npx.cmd` cannot be spawned directly with `execFileSync`).
const prismaCli = path.join(rootDir, "node_modules", "prisma", "build", "index.js");

/**
 * Run the Prisma CLI against the test database.
 *
 * @param {string[]} args
 */
function prisma(args) {
  execFileSync(process.execPath, [prismaCli, ...args], {
    cwd: rootDir,
    stdio: process.env.PRISMA_TEST_VERBOSE ? "inherit" : "ignore",
    env: { ...process.env, DATABASE_URL: "file:./dev.test.db" },
  });
}

/**
 * Prepare the test database and its Prisma client.
 *
 * @returns {void}
 */
export function setup() {
  // 1. Derive the SQLite schema from the canonical PostgreSQL one, so the
  //    two models are always identical.
  execFileSync(process.execPath, [path.join(rootDir, "scripts", "make-test-schema.mjs")], {
    cwd: rootDir,
    stdio: "ignore",
  });

  // 2. Generate the SQLite client into `src/generated/prisma-sqlite`.
  prisma(["generate", "--schema", sqliteSchemaPath]);

  // 3. Start from an empty database and apply the current schema to it.
  //
  //    `db push` is used rather than `migrate deploy` because the app's
  //    migration history is PostgreSQL-specific (`prisma/migrations`),
  //    while the test database is SQLite. `db push` builds the schema
  //    straight from the schema file, which is exactly what a throwaway
  //    test database needs.
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    rmSync(`${testDbPath}${suffix}`, { force: true });
  }
  prisma(["db", "push", "--schema", sqliteSchemaPath, "--skip-generate", "--accept-data-loss"]);
}
