import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const ok = (data: unknown, init?: ResponseInit) => NextResponse.json(data, init);
export const fail = (message: string, status = 400, extra?: Record<string, unknown>) =>
  NextResponse.json({ error: message, ...extra }, { status });

export function zodMessage(err: ZodError) {
  return err.issues[0]?.message ?? "Please check the form and try again.";
}

// Small in-memory rate limiter (per server instance). Good enough to slow down
// brute-force attempts; use a shared store such as Upstash if you scale out.
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
