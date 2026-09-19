// Runs before every test file. Points Prisma at a dedicated local test
// PostgreSQL database (never the real dev database) — schema is pushed
// into it by the `npm test` script (via docker-compose's db service)
// before Vitest starts.
process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/dziflip_test";
