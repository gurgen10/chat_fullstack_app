import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.warn(
    "DATABASE_URL is not set. Set it to a PostgreSQL connection string (e.g. postgres://user:pass@localhost:5432/mychat).",
  );
}

export const pool = new pg.Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30_000,
});
