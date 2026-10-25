/** Local testing helper: create (or reset) a staff login. Usage: npx tsx scripts/make-staff.ts email password */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, users } from "../src/db";

(async () => {
  const [email, password] = process.argv.slice(2);
  if (!email || !password || password.length < 8) throw new Error("Usage: npx tsx scripts/make-staff.ts email password(8+ chars)");
  const hash = await bcrypt.hash(password, 12);
  const [u] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  if (u) await db.update(users).set({ role: "STAFF", passwordHash: hash }).where(eq(users.id, u.id));
  else await db.insert(users).values({ email: email.toLowerCase(), name: "Staff", role: "STAFF", passwordHash: hash });
  console.log(`Staff login ready: ${email}`);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
