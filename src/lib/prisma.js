import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 *
 * Next.js hot-reloads modules in development. Without caching the client on
 * `globalThis`, every reload would open a new connection pool and eventually
 * exhaust the connection limit.
 *
 * ## Why the client is chosen at runtime
 *
 * The generated Prisma client is **provider-specific**: the client generated
 * from the PostgreSQL schema cannot open a SQLite connection, and vice
 * versa. The app talks to PostgreSQL (Neon); the test suite talks to a local
 * SQLite file, because a test run must never touch the development
 * database.
 *
 * So there are two generated clients:
 *
 * - `@prisma/client` — generated from `prisma/schema.prisma` (PostgreSQL).
 *   This is the one the app uses.
 * - `@/lib/prisma/sqlite-client` — generated from
 *   `prisma/schema.sqlite.prisma` into `src/generated/prisma-sqlite`, and
 *   used only when `DATABASE_URL` points at a `file:` URL.
 *
 * `tests/setup.js` regenerates the SQLite client before the suite runs, so
 * the two cannot drift apart.
 *
 * ## Why the SQLite client is loaded lazily
 *
 * The SQLite client is built into `src/generated/prisma-sqlite`, which is
 * git-ignored and only exists on a machine that has run the test suite (or
 * the dedicated generate script). A production build — in CI/CD or in Docker
 * — has no test step, so that directory is absent.
 *
 * The module path was therefore a literal `require()` call, and bundlers
 * resolve literal requires **statically**, whether or not the branch that
 * uses them can ever run. That made every production build fail with
 * `Module not found: Can't resolve '../generated/prisma-sqlite'`, even though
 * the application only ever talks to PostgreSQL.
 *
 * So the SQLite client is loaded on first use instead: the path is held in a
 * variable (which keeps the bundler from resolving it at build time) and the
 * module is required the first time a model is actually accessed. In
 * production that first access never happens through the SQLite branch, so
 * the generated client is never required and the build succeeds. In the test
 * suite it is required on the first query, exactly as before.
 */
const globalForPrisma = globalThis;

/** @type {import("@prisma/client").PrismaClient | undefined} */
let client;

/**
 * Is the current `DATABASE_URL` a local SQLite file?
 *
 * @returns {boolean}
 */
function isSqlite() {
  return (process.env.DATABASE_URL ?? "").startsWith("file:");
}

/**
 * Build the SQLite Prisma client.
 *
 * The path is assembled at runtime so the bundler cannot statically resolve
 * it — the generated client is not present in a production build, and must
 * not be required unless the SQLite branch is actually taken.
 *
 * @returns {import("@prisma/client").PrismaClient}
 */
function createSqliteClient() {
  // The generated client is CommonJS, so it is loaded through `createRequire`
  // rather than a bare `import` — which keeps this file valid ESM for both
  // Next.js and Vitest.
  const require = createRequire(import.meta.url);
  const generatedPath = ["..", "generated", "prisma-sqlite"].join("/");
  const { PrismaClient: SqlitePrismaClient } = require(generatedPath);
  return new SqlitePrismaClient({
    log: ["error"],
  });
}

if (isSqlite()) {
  // Lazily initialised: the client is built the first time a model is
  // accessed, so importing this module never fails on a checkout that has
  // not generated the SQLite client.
  client = new Proxy(
    {},
    {
      get(_target, property) {
        if (!globalForPrisma.sqlitePrismaClient) {
          globalForPrisma.sqlitePrismaClient = createSqliteClient();
        }
        const value = globalForPrisma.sqlitePrismaClient[property];
        return typeof value === "function" ? value.bind(globalForPrisma.sqlitePrismaClient) : value;
      },
    },
  );
} else {
  client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/** @type {import("@prisma/client").PrismaClient} */
export const prisma = globalForPrisma.prisma ?? client;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
