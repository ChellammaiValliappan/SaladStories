"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function AuthForm({ mode, admin = false }: { mode: "login" | "register"; admin?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "login" ? { email: form.email, password: form.password } : form),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error);
    if (admin && data.role !== "ADMIN") return setError("This account doesn't have admin access.");
    const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
    router.push(admin || data.role === "ADMIN" ? safeNext ?? "/admin" : safeNext ?? "/account");
    router.refresh();
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      {mode === "register" && (
        <>
          <div>
            <label className="label" htmlFor="name">Full name</label>
            <input id="name" className="field" autoComplete="name" required value={form.name} onChange={set("name")} />
          </div>
          <div>
            <label className="label" htmlFor="phone">Mobile number <span className="font-normal text-ink-soft">(optional)</span></label>
            <input id="phone" className="field" inputMode="tel" maxLength={10} autoComplete="tel-national" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "") })} />
          </div>
        </>
      )}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" type="email" className="field" autoComplete="email" required value={form.email} onChange={set("email")} />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" type="password" className="field" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 8 : 1} value={form.password} onChange={set("password")} />
        {mode === "register" && <p className="mt-1 text-xs text-ink-soft">At least 8 characters.</p>}
      </div>
      {error && <p className="rounded-xl bg-tomato/10 p-3 text-sm font-semibold text-tomato" role="alert">{error}</p>}
      <button className="btn btn-primary h-14 w-full rounded-2xl text-base" disabled={busy}>
        {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
      </button>
      {!admin && (
        <p className="text-center text-sm text-ink-soft">
          {mode === "login" ? (
            <>New here? <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-basil underline">Create an account</Link></>
          ) : (
            <>Already have an account? <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-basil underline">Sign in</Link></>
          )}
        </p>
      )}
    </form>
  );
}
