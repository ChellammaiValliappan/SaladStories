import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Production: DATABASE_URL=postgres://... (Neon, Supabase or any PostgreSQL).
 * Local development: leave DATABASE_URL empty and an embedded PostgreSQL
 * (PGlite) is stored in the ./.pglite folder — nothing to install.
 */
export type DB = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __db?: DB };

function createDb(): DB {
  const url = process.env.DATABASE_URL;
  if (url && url.startsWith("postgres")) {
    const client = postgres(url, { max: 3, idle_timeout: 20, prepare: false });
    return drizzlePg(client, { schema });
  }
  const hosted = process.env.NETLIFY || process.env.VERCEL;
  if ((process.env.NODE_ENV === "production" || hosted) && !process.env.ALLOW_PGLITE) {
    throw new Error(
      "DATABASE_URL is missing or not a postgres:// URL. Add your Neon connection string in the hosting " +
        "environment variables (Netlify: Project configuration → Environment variables) and redeploy.",
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PGlite } = require("@electric-sql/pglite");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require("drizzle-orm/pglite");
  const client = new PGlite(process.env.PGLITE_DIR || ".pglite");
  // Close cleanly on Ctrl+C so the local database files aren't left half-written.
  const shutdown = () => {
    client.close().finally(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return drizzle(client, { schema }) as unknown as DB;
}

/** Created on first use, so builds don't need a database connection. */
export const db: DB = new Proxy({} as DB, {
  get(_, prop) {
    const real = globalForDb.__db ?? (globalForDb.__db = createDb());
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
export * from "./schema";
