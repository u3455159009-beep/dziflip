// Runs before every test file. Points Prisma at a dedicated test SQLite
// database (never the real dev.db) — schema is pushed into it by the
// `npm test` script before Vitest starts. Prisma resolves this relative
// path against prisma/schema.prisma's directory, so the actual file lands
// at prisma/tests/test.db (gitignored).
process.env.DATABASE_URL = "file:./tests/test.db";
