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

if (isSqlite()) {
  // The generated client is CommonJS, so it is loaded through `createRequire`
  // rather than a bare `import` — which keeps this file valid ESM for both
  // Next.js and Vitest.
  const require = createRequire(import.meta.url);
  const { PrismaClient: SqlitePrismaClient } = require("../generated/prisma-sqlite");
  client = new SqlitePrismaClient({
    log: ["error"],
  });
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
