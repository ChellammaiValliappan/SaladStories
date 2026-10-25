"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChefHat, UserCog, BarChart3, CreditCard, ExternalLink, LayoutDashboard, LogOut, MessageSquareQuote, Package, Settings, Ticket, Truck, Users, UtensilsCrossed, CalendarDays, Bell, CalendarRange, Inbox, FileText } from "lucide-react";
import { LogoMark } from "../Logo";

const ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, staff: true },
  { href: "/admin/orders", label: "Orders", icon: Package, staff: true },
  { href: "/admin/kitchen", label: "Kitchen sheet", icon: ChefHat, staff: true },
  { href: "/admin/schedule", label: "Schedule", icon: CalendarRange, staff: true },
  { href: "/admin/plans", label: "Meal plans", icon: CalendarDays, staff: true },
  { href: "/admin/requests", label: "Skip requests", icon: Inbox, staff: true, count: "requests" as const },
  { href: "/admin/products", label: "Menu", icon: UtensilsCrossed, staff: true },
  { href: "/admin/coupons", label: "Coupons", icon: Ticket },
  { href: "/admin/delivery", label: "Delivery", icon: Truck },
  { href: "/admin/customers", label: "Customers", icon: Users, staff: true },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/invoices", label: "Invoices", icon: FileText },
  { href: "/admin/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin/reviews", label: "Reviews", icon: MessageSquareQuote },
  { href: "/admin/team", label: "Team", icon: UserCog },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminNav({ name, role, unread = 0, requests = 0 }: { name: string; role: string; unread?: number; requests?: number }) {
  const items = ITEMS.filter((i) => role === "ADMIN" || ("staff" in i && i.staff));
  const pathname = usePathname();
  const active = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }
  return (
    <aside className="sticky top-0 z-30 bg-basil-deep text-white lg:h-dvh lg:overflow-y-auto">
      <div className="flex items-center gap-2.5 px-4 py-3 lg:px-5 lg:py-6">
        <LogoMark className="h-8 w-8" />
        <span className="font-display text-lg font-bold">Admin</span>
        <Link href="/admin/notifications" aria-label={`Alerts${unread ? ` (${unread} new)` : ""}`} className={`relative ml-auto rounded-full p-2 ${active("/admin/notifications") ? "bg-white text-basil-deep" : "hover:bg-white/10"}`}>
          <Bell className="h-5 w-5" />
          {unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-tomato px-1 text-center text-[11px] font-bold leading-5 text-white">{unread > 99 ? "99+" : unread}</span>}
        </Link>
        <Link href="/" target="_blank" className=" inline-flex items-center gap-1 text-xs text-white/70 hover:text-white">
          View site <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3" aria-label="Admin">
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold ${active(i.href) ? "bg-white text-basil-deep" : "text-white/80 hover:bg-white/10"}`}
          >
            <i.icon className="h-4 w-4" /> {i.label}
            {"count" in i && requests > 0 && <span className="ml-auto rounded-full bg-carrot px-1.5 text-xs font-bold text-white">{requests}</span>}
          </Link>
        ))}
      </nav>
      <div className="hidden px-5 py-6 text-sm text-white/70 lg:block">
        <p>Signed in as {name}{role === "STAFF" ? " (staff)" : ""}</p>
        <button onClick={logout} className="mt-2 inline-flex items-center gap-1.5 font-semibold text-white hover:underline">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </aside>
  );
}
