"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, MapPin, X } from "lucide-react";
import { useCart } from "@/lib/cart-store";

export function LocationPicker({ compact = false }: { compact?: boolean }) {
  const { pincode, areaName, setLocation, hydrated } = useCart();
  const [open, setOpen] = useState(false);
  const label = hydrated && areaName ? `Delivering to ${areaName}` : "Check if we deliver to you";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex items-center gap-2 text-left font-semibold text-basil-deep ${
          compact ? "rounded-full border border-line bg-white px-3.5 py-2 text-sm hover:border-basil" : "w-full py-1 text-[0.95rem]"
        }`}
      >
        <MapPin className="h-4 w-4 shrink-0 text-tomato" />
        <span className="truncate">{label}</span>
        {hydrated && pincode && <span className="font-normal text-ink-soft">{pincode}</span>}
        <ChevronDown className="ml-auto h-4 w-4 shrink-0" />
      </button>
      {open && <LocationSheet onClose={() => setOpen(false)} onSaved={(p, a) => setLocation(p, a)} initial={pincode ?? ""} />}
    </>
  );
}

function LocationSheet({ onClose, onSaved, initial }: { onClose: () => void; onSaved: (pin: string, area: string) => void; initial: string }) {
  const [pin, setPin] = useState(initial);
  const [state, setState] = useState<"idle" | "checking" | "ok" | "no" | "error">("idle");
  const [area, setArea] = useState("");
  const [msg, setMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setState("checking");
    const res = await fetch(`/api/delivery/check?pincode=${encodeURIComponent(pin)}`);
    const data = await res.json();
    if (!res.ok) {
      setState("error");
      setMsg(data.error);
    } else if (data.serviceable) {
      setState("ok");
      setArea(data.area.name);
      onSaved(pin, data.area.name);
    } else {
      setState("no");
      setMsg(data.message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="loc-title"
        className="w-full max-w-md rounded-t-[1.75rem] bg-paper p-6 pb-8 shadow-xl sm:rounded-[1.75rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <h2 id="loc-title" className="text-2xl font-bold">Where should we deliver?</h2>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full hover:bg-crate" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-ink-soft">We currently deliver to Taramani, Perungudi and Thoraipakkam in Chennai.</p>
        <form onSubmit={check} className="flex gap-2">
          <label htmlFor="pin" className="sr-only">PIN code</label>
          <input
            id="pin"
            ref={inputRef}
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            placeholder="6-digit PIN code"
            className="field"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ""));
              setState("idle");
            }}
          />
          <button className="btn btn-primary shrink-0" disabled={pin.length !== 6 || state === "checking"}>
            {state === "checking" ? "Checking…" : "Check"}
          </button>
        </form>
        {state === "ok" && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-basil-soft p-4 text-basil-deep">
            <Check className="h-5 w-5" />
            <div>
              <p className="font-semibold">Great — we deliver to {area}.</p>
              <button onClick={onClose} className="mt-1 text-sm font-semibold underline">Continue browsing</button>
            </div>
          </div>
        )}
        {state === "error" && <p className="mt-3 text-sm font-medium text-tomato">{msg}</p>}
        {state === "no" && <InterestForm pincode={pin} message={msg} />}
      </div>
    </div>
  );
}

export function InterestForm({ pincode, message }: { pincode: string; message: string }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const res = await fetch("/api/delivery/interest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, pincode }),
    });
    if (res.ok) setDone(true);
    else setErr((await res.json()).error);
  }
  return (
    <div className="mt-4 rounded-2xl bg-crate p-4">
      <p className="font-semibold">{message}</p>
      {done ? (
        <p className="mt-2 text-sm text-basil-deep">Thanks! We'll message you when we start delivering to {pincode}.</p>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-2">
          <p className="text-sm text-ink-soft">Leave your number and we'll tell you when we reach your area.</p>
          <input className="field" placeholder="Your name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex gap-2">
            <input
              className="field"
              inputMode="tel"
              placeholder="10-digit mobile"
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
            />
            <button className="btn btn-primary shrink-0" disabled={phone.length !== 10}>Notify me</button>
          </div>
          {err && <p className="text-sm text-tomato">{err}</p>}
        </form>
      )}
    </div>
  );
}
