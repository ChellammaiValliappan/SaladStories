/** Applies SQL migrations in ./drizzle to the configured database. */
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import { migrate as migrateLite } from "drizzle-orm/pglite/migrator";
import { db } from "../src/db";

async function main() {
  const url = process.env.DATABASE_URL;
  const opts = { migrationsFolder: "./drizzle" };
  if (url && url.startsWith("postgres")) await migratePg(db, opts);
  else await migrateLite(db as never, opts);
  console.log("Database is up to date.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
