"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, ShoppingBag, User, X } from "lucide-react";
import { Logo } from "./Logo";
import { LocationPicker } from "./LocationPicker";
import { cartCount, useCart } from "@/lib/cart-store";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/menu", label: "Menu" },
  { href: "/about", label: "About us" },
  { href: "/contact", label: "Contact us" },
];

export function HeaderBar({ user }: { user: { name: string; isAdmin: boolean } | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const lines = useCart((s) => s.lines);
  const hydrated = useCart((s) => s.hydrated);
  const lastAddedAt = useCart((s) => s.lastAddedAt);
  const count = hydrated ? cartCount(lines) : 0;
  const [bump, setBump] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!lastAddedAt) return;
    setBump(true);
    const t = setTimeout(() => setBump(false), 400);
    return () => clearTimeout(t);
  }, [lastAddedAt]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Logo />
        <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-full px-3.5 py-2 text-[0.95rem] font-semibold transition-colors ${
                isActive(n.href) ? "bg-basil-soft text-basil-deep" : "text-ink-soft hover:text-basil-deep"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden lg:block">
          <LocationPicker compact />
        </div>
        <div className="ml-auto flex items-center gap-1 lg:ml-2">
          <Link
            href={user ? (user.isAdmin ? "/admin" : "/account") : "/login"}
            className="grid h-11 w-11 place-items-center rounded-full text-basil-deep hover:bg-basil-soft"
            aria-label={user ? "Your account" : "Sign in"}
          >
            <User className="h-[22px] w-[22px]" />
          </Link>
          <Link
            href="/cart"
            className="relative grid h-11 w-11 place-items-center rounded-full text-basil-deep hover:bg-basil-soft"
            aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}
          >
            <ShoppingBag className="h-[22px] w-[22px]" />
            {count > 0 && (
              <span
                className={`absolute right-0.5 top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-tomato px-1 text-[11px] font-bold text-white ${bump ? "pop" : ""}`}
              >
                {count}
              </span>
            )}
          </Link>
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-full text-basil-deep hover:bg-basil-soft md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>
      <div className="border-t border-line bg-crate/60 px-4 py-2 lg:hidden">
        <div className="mx-auto max-w-6xl">
          <LocationPicker />
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" className="border-t border-line bg-paper px-4 pb-4 pt-2 md:hidden" aria-label="Mobile">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`block rounded-xl px-3 py-3 text-lg font-semibold ${isActive(n.href) ? "bg-basil-soft text-basil-deep" : "text-ink"}`}
            >
              {n.label}
            </Link>
          ))}
          <Link href={user ? "/account" : "/login"} className="block rounded-xl px-3 py-3 text-lg font-semibold text-ink">
            {user ? `Hi, ${user.name.split(" ")[0]}` : "Sign in or create account"}
          </Link>
        </nav>
      )}
    </header>
  );
}
