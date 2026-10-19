"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";

type State = "loading" | "unsupported" | "ios-install" | "blocked" | "off" | "on" | "busy";

function keyToBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function deviceName() {
  const ua = navigator.userAgent;
  if (/iphone/i.test(ua)) return "iPhone";
  if (/ipad/i.test(ua)) return "iPad";
  if (/android/i.test(ua)) return "Android phone";
  if (/mac/i.test(ua)) return "Mac";
  if (/windows/i.test(ua)) return "Windows PC";
  return "Browser";
}

/** "Get order notifications on this phone" — free notifications sent by the site itself. */
export function PushToggle({ publicKey, compact = false }: { publicKey: string; compact?: boolean }) {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setState(ios && !standalone ? "ios-install" : "unsupported");
      }
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.register("/admin-sw.js", { scope: "/admin/" });
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function turnOn() {
    setState("busy");
    setMsg("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "blocked" : "off");
      const reg = await navigator.serviceWorker.register("/admin-sw.js", { scope: "/admin/" });
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }));
      const res = await fetch("/api/admin/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sub.toJSON(), device: deviceName(), test: true }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't save.");
      setState("on");
      setMsg("Done — a test notification is on its way.");
    } catch (e) {
      setState("off");
      setMsg(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    }
  }

  async function turnOff() {
    setState("busy");
    const reg = await navigator.serviceWorker.getRegistration("/admin/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/admin/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setState("off");
    setMsg("");
  }

  async function test() {
    setState("busy");
    const reg = await navigator.serviceWorker.getRegistration("/admin/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/admin/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...sub.toJSON(), device: deviceName(), test: true }) });
      setMsg("Test sent — check your notifications.");
    }
    setState("on");
  }

  if (state === "loading") return null;
  if (compact && state === "on") return null;

  const wrap = compact ? "mb-5 rounded-2xl border-2 border-basil bg-white p-4" : "";
  return (
    <div className={wrap}>
      {state === "on" || (state === "busy" && !compact) ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto text-sm font-semibold text-basil">✓ Order notifications are on for this device.</p>
          <button type="button" onClick={test} disabled={state === "busy"} className="btn btn-ghost">Send test</button>
          <button type="button" onClick={turnOff} disabled={state === "busy"} className="btn btn-ghost"><BellOff className="h-4 w-4" /> Turn off</button>
        </div>
      ) : state === "ios-install" ? (
        <p className="text-sm">
          <b>iPhone:</b> to get order notifications, open this page in <b>Safari</b> → tap <b>Share</b> → <b>Add to Home Screen</b>, open Salad Stories from your home screen, log in, and tap the button here.
        </p>
      ) : state === "unsupported" ? (
        <p className="text-sm text-ink-soft">This browser can't show notifications. Use Chrome on Android, or Safari on iPhone (added to the Home Screen).</p>
      ) : state === "blocked" ? (
        <p className="text-sm">Notifications are blocked for this site. Allow them in your browser&apos;s site settings (tap the icon left of the address), then reload.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="mr-auto text-sm">
            <b>Get a notification on this {compact ? "device" : "phone or computer"}</b> for every new order and payment to check — sent by your site, free.
          </p>
          <button type="button" onClick={turnOn} disabled={state === "busy"} className="btn btn-primary">
            <Bell className="h-4 w-4" /> {state === "busy" ? "Turning on…" : "Turn on notifications"}
          </button>
        </div>
      )}
      {msg && <p className="mt-2 text-sm font-semibold text-basil" role="status">{msg}</p>}
    </div>
  );
}
