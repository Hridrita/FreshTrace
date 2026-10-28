/**
 * Global Vitest setup — runs in every test worker.
 *
 * SRS §14.1: integration tests run against a dedicated `dev.test.db` SQLite
 * file, never the developer database. The Prisma client is pointed at that
 * file via `DATABASE_URL` before any module imports `@/lib/prisma`, so the
 * same code path is exercised locally and in CI.
 *
 * The database and its client are prepared once, in `tests/global-setup.js`,
 * because `prisma generate` writes into a single output directory and
 * several workers doing that at once would leave a half-written client
 * behind. This file only has to put each worker in the right environment.
 */

/**
 * `file:` URLs are resolved relative to the schema location by Prisma, so
 * the URL mirrors the dev URL shape exactly.
 */
process.env.DATABASE_URL = "file:./dev.test.db";

// Keep deterministic time-zone handling in tests regardless of host locale.
process.env.TZ = "Asia/Dhaka";
