import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";

const COOKIE = "ss_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  const s = !!process.env.TEST_DATABASE_URL ? process.env.TEST_AUTH_SECRET : process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set (32+ random characters).");
    return new TextEncoder().encode("dev-only-secret-change-me-please-123");
  }
  return new TextEncoder().encode(s);
}

export type Role = "CUSTOMER" | "STAFF" | "ADMIN";

export interface Session {
  uid: string;
  role: Role;
}

/** ADMIN: everything. STAFF: dashboard, orders and sold-out switches. */
export const isTeam = (role?: string | null) => role === "ADMIN" || role === "STAFF";
export const toRole = (r: unknown): Role => (r === "ADMIN" ? "ADMIN" : r === "STAFF" ? "STAFF" : "CUSTOMER");

export async function createSession(session: Session) {
  const token = await new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { uid: String(payload.uid), role: toRole(payload.role) };
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const s = await getSession();
  if (!s) return null;
  const [user] = await db.select().from(users).where(eq(users.id, s.uid));
  if (!user || user.isBlocked) return null;
  return user;
}

/** Owner/admin only (settings, team, coupons, refunds, menu editing…). */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !isTeam(user.role)) redirect("/admin/login");
  if (user.role !== "ADMIN") redirect("/admin?err=" + encodeURIComponent("Only an admin can open that page."));
  return user;
}

/** Any team member (admin or staff). */
export async function requireStaff() {
  const user = await getCurrentUser();
  if (!user || !isTeam(user.role)) redirect("/admin/login");
  return user;
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);
