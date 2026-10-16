import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { HeaderBar } from "./HeaderBar";

export async function Header() {
  const [settings, user] = await Promise.all([getSettings(), getCurrentUser()]);
  return (
    <>
      {settings.announcement && (
        <div className="bg-basil-deep px-4 py-2 text-center text-sm font-medium text-white">{settings.announcement}</div>
      )}
      <HeaderBar user={user ? { name: user.name, isAdmin: user.role === "ADMIN" } : null} />
    </>
  );
}
