import { getCurrentUser, isTeam } from "@/lib/auth";
import { readFile } from "@/lib/files";

export const dynamic = "force-dynamic";

/** Bill photos and PDFs — team only. */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const u = await getCurrentUser();
  if (!u || !isTeam(u.role)) return new Response("Please log in.", { status: 401 });
  const key = (await params).key.map(decodeURIComponent).join("/");
  if (!/^bills\/[\w-]+\/[\w-]+\.(jpg|png|webp|heic|pdf)$/.test(key)) return new Response("Not found", { status: 404 });
  const f = await readFile(key);
  if (!f) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(f.bytes), {
    headers: { "Content-Type": f.contentType, "Content-Disposition": "inline", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
