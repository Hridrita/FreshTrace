/**
 * Generate the provider-specific Prisma schema files.
 *
 * The canonical schema is `prisma/schema.prisma` (PostgreSQL — the app's
 * real database is Neon). The test suite runs against a local SQLite file,
 * so it needs a SQLite-provider copy of the *same* model definitions.
 *
 * Rather than maintaining two schemas by hand — which is how they drift —
 * this script derives the SQLite variant from the canonical one. It is run
 * by `tests/setup.js` before the test database is created, so the two can
 * never disagree.
 *
 * Run it directly with `node scripts/make-test-schema.mjs`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const canonicalPath = path.join(rootDir, "prisma", "schema.prisma");
const sqlitePath = path.join(rootDir, "prisma", "schema.sqlite.prisma");

const canonical = fs.readFileSync(canonicalPath, "utf8");

// The datasource block is the only part that differs between providers.
// Everything above it (the generator) and everything below it (the models)
// is shared verbatim.
const DATASOURCE = /datasource db \{[^}]*\}/;
const GENERATOR = /generator client \{[^}]*\}/;

if (!DATASOURCE.test(canonical)) {
  throw new Error("Could not find the `datasource db` block in prisma/schema.prisma.");
}
if (!GENERATOR.test(canonical)) {
  throw new Error("Could not find the `generator client` block in prisma/schema.prisma.");
}

const sqlite = canonical
  .replace(
    GENERATOR,
    `generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma-sqlite"
}`,
  )
  .replace(
    DATASOURCE,
    `datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}`,
  );

fs.writeFileSync(sqlitePath, sqlite);
console.log(`wrote ${path.relative(rootDir, sqlitePath)}`);
