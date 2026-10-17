import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Salad Stories — Fresh bowls, high protein, delivered", template: "%s | Salad Stories" },
  description:
    "Order protein-focused salads, paneer bowls, egg salads and fresh fruit bowls in Taramani, Perungudi and Thoraipakkam, Chennai.",
  openGraph: { type: "website", siteName: "Salad Stories", images: ["/images/bowls/hero.svg"] },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Salad Stories", statusBarStyle: "default" },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: "#1f6b3a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
