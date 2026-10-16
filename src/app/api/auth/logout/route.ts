import { destroySession } from "@/lib/auth";
import { ok } from "@/lib/http";

export async function POST() {
  await destroySession();
  return ok({ done: true });
}
