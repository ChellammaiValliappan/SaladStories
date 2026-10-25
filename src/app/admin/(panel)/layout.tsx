import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { AdminNav } from "@/components/admin/AdminNav";
import { unreadCount } from "@/lib/biz/outbox";
import { pendingRequestCount } from "@/lib/biz/requests";

export const metadata: Metadata = { title: { default: "Admin", template: "%s | Admin" }, robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const [unread, requests] = await Promise.all([unreadCount().catch(() => 0), pendingRequestCount().catch(() => 0)]);
  return (
    <div className="min-h-dvh bg-[#f7f4ec] lg:grid lg:grid-cols-[15rem_1fr] print:block print:bg-white">
      <div className="print:hidden"><AdminNav name={user.name} role={user.role} unread={unread} requests={requests} /></div>
      <main className="min-w-0 px-4 py-6 lg:px-8 lg:py-8 print:p-0">{children}</main>
    </div>
  );
}
