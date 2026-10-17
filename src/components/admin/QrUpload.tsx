"use client";

import { useRef, useState } from "react";
import jsQR from "jsqr";
import { ImageUp } from "lucide-react";

/** Reads a UPI QR from a screenshot in the browser and fills the QR-text field. */
export function QrUpload({ targetId }: { targetId: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function onFile(file?: File) {
    if (!file) return;
    setMsg(null);
    try {
      const bitmap = await createImageBitmap(file);
      // Try the full image and a few zoomed-in crops (screenshots have a lot around the QR).
      const attempts: [number, number, number, number][] = [
        [0, 0, 1, 1], [0.05, 0.15, 0.9, 0.55], [0.1, 0.2, 0.8, 0.45], [0, 0.1, 1, 0.7],
      ];
      for (const [x, y, w, h] of attempts) {
        const sw = bitmap.width * w, sh = bitmap.height * h;
        const scale = Math.min(1, 1600 / Math.max(sw, sh));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(sw * scale);
        canvas.height = Math.round(sh * scale);
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(bitmap, bitmap.width * x, bitmap.height * y, sw, sh, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(data.data, data.width, data.height, { inversionAttempts: "attemptBoth" });
        if (code?.data?.toLowerCase().startsWith("upi://")) {
          const field = document.getElementById(targetId) as HTMLInputElement | null;
          if (field) field.value = code.data;
          setMsg({ ok: true, text: "QR read. Tap Save settings to use it." });
          return;
        }
      }
      setMsg({ ok: false, text: "Couldn't find a UPI QR in that image. Try a clear screenshot of just your QR code." });
    } catch {
      setMsg({ ok: false, text: "Couldn't open that image." });
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="mt-2">
      <label className="btn btn-ghost min-h-10 cursor-pointer px-4 text-sm">
        <ImageUp className="h-4 w-4" /> Upload a screenshot of your QR
        <input ref={input} type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      {msg && <p className={`mt-1 text-sm font-semibold ${msg.ok ? "text-basil" : "text-tomato"}`}>{msg.text}</p>}
    </div>
  );
}
