import "server-only";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, storedFiles } from "@/db";
import { isTestSite } from "./test-site";

export const MAX_UPLOAD = 4 * 1024 * 1024;
export const UPLOAD_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

/** Netlify Blobs on Netlify (free, private); the database elsewhere (local dev, tests). */
async function blobStore() {
  if (!process.env.NETLIFY && !process.env.NETLIFY_BLOBS_CONTEXT) return null;
  try {
    const { getStore } = await import("@netlify/blobs");
    return getStore({ name: isTestSite() ? "bills-test" : "bills", consistency: "strong" });
  } catch (e) {
    console.error("[files] Netlify Blobs unavailable, using the database", e);
    return null;
  }
}

export async function saveFile(file: File, folder: string) {
  if (!UPLOAD_TYPES[file.type]) throw new Error("Upload a photo (JPG, PNG, WebP, HEIC) or a PDF.");
  if (file.size > MAX_UPLOAD) throw new Error("That file is over 4 MB. Take the photo again at a lower size, or upload a PDF.");
  const key = `${folder}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${UPLOAD_TYPES[file.type]}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const store = await blobStore();
  if (store) {
    try {
      await store.set(key, new Blob([bytes], { type: file.type }), { metadata: { contentType: file.type } });
      return key;
    } catch (e) {
      console.error("[files] blob write failed, using the database", e);
    }
  }
  await db.insert(storedFiles).values({ key, contentType: file.type, size: bytes.length, dataBase64: bytes.toString("base64") });
  return key;
}

export async function readFile(key: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  const [row] = await db.select().from(storedFiles).where(eq(storedFiles.key, key));
  if (row) return { bytes: Buffer.from(row.dataBase64, "base64"), contentType: row.contentType };
  const store = await blobStore();
  if (!store) return null;
  const got = await store.getWithMetadata(key, { type: "arrayBuffer" }).catch(() => null);
  if (!got) return null;
  return { bytes: Buffer.from(got.data as ArrayBuffer), contentType: String(got.metadata?.contentType ?? "application/octet-stream") };
}
