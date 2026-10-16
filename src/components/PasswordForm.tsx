"use client";

import { useState } from "react";

export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current, next }) });
    const data = await res.json();
    setMsg(res.ok ? { ok: true, text: "Password changed." } : { ok: false, text: data.error });
    if (res.ok) { setCurrent(""); setNext(""); }
  }
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div><label className="label" htmlFor="pw-cur">Current password</label><input id="pw-cur" type="password" autoComplete="current-password" className="field" value={current} onChange={(e) => setCurrent(e.target.value)} required /></div>
      <div><label className="label" htmlFor="pw-new">New password</label><input id="pw-new" type="password" autoComplete="new-password" minLength={8} className="field" value={next} onChange={(e) => setNext(e.target.value)} required /></div>
      <button className="btn btn-primary">Change password</button>
      {msg && <p className={`text-sm font-semibold sm:col-span-3 ${msg.ok ? "text-basil" : "text-tomato"}`}>{msg.text}</p>}
    </form>
  );
}
