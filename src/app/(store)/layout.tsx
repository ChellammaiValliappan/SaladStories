import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { MobileCartBar } from "@/components/MobileCartBar";
import { CartSync } from "@/components/CartSync";
import { getSession } from "@/lib/auth";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>
      <Header />
      <main id="main" className="min-h-[60vh] pb-20 md:pb-0">{children}</main>
      <Footer />
      <MobileCartBar />
      <CartSync userId={session?.uid ?? null} />
    </>
  );
}
