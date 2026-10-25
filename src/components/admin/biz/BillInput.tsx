"use client";

import { useRef, useState } from "react";
import { Camera, FileText, X } from "lucide-react";

/** Bill photo / PDF picker. Photos are shrunk on the phone before upload (fast on mobile data). */
export function BillInput({ current }: { current?: { href: string; name: string; type: string } | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ url: string | null; name: string; size: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function shrink(file: File): Promise<File> {
    if (!file.type.startsWith("image/") || file.type === "image/heic") return file;
    const img = await createImageBitmap(file).catch(() => null);
    if (!img) return file;
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.72));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setErr("");
    const f = e.target.files?.[0];
    if (!f) return setPreview(null);
    setBusy(true);
    const small = await shrink(f);
    setBusy(false);
    if (small.size > 4 * 1024 * 1024) {
      setErr("That file is over 4 MB. Take the photo again or upload a smaller PDF.");
      e.target.value = "";
      return setPreview(null);
    }
    if (small !== f) {
      const dt = new DataTransfer();
      dt.items.add(small);
      e.target.files = dt.files;
    }
    setPreview({ url: small.type.startsWith("image/") ? URL.createObjectURL(small) : null, name: small.name, size: small.size });
  }

  function clear() {
    if (input.current) input.current.value = "";
    setPreview(null);
  }

  return (
    <div>
      <span className="label">Bill photo or PDF (optional)</span>
      {current && !preview && (
        <a href={current.href} target="_blank" rel="noopener" className="mb-2 flex items-center gap-2 text-sm font-semibold text-basil underline">
          <FileText className="h-4 w-4" /> {current.name || "Current bill"} — tap to view
        </a>
      )}
      <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-line bg-white p-3 text-sm font-semibold hover:border-basil">
        <Camera className="h-5 w-5 text-basil" />
        {busy ? "Preparing…" : preview ? "Change file" : current ? "Replace bill" : "Take photo or choose file"}
        <input ref={input} type="file" name="bill" accept="image/*,application/pdf" className="sr-only" onChange={onPick} />
      </label>
      {preview && (
        <div className="mt-2 flex items-center gap-3 text-sm">
          {preview.url ? <img src={preview.url} alt="Bill preview" className="h-16 w-16 rounded-lg object-cover" /> : <FileText className="h-8 w-8 text-ink-soft" />}
          <span className="min-w-0 flex-1 truncate">{preview.name} · {Math.round(preview.size / 1024)} KB</span>
          <button type="button" onClick={clear} aria-label="Remove file" className="rounded-full p-1 hover:bg-crate"><X className="h-4 w-4" /></button>
        </div>
      )}
      {err && <p className="mt-1 text-sm font-semibold text-tomato" role="alert">{err}</p>}
    </div>
  );
}
