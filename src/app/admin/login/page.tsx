import type { Metadata } from "next";
import { Suspense } from "react";
import { LogoMark } from "@/components/Logo";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false } };

export default function AdminLogin() {
  return (
    <div className="grid min-h-dvh place-items-center bg-basil-deep px-4">
      <div className="w-full max-w-sm rounded-[2rem] bg-paper p-7">
        <LogoMark className="h-12 w-12" />
        <h1 className="mt-4 text-3xl font-[800]">Salad Stories admin</h1>
        <p className="mt-1 text-sm text-ink-soft">Sign in to manage orders, menu and delivery.</p>
        <Suspense>
          <AuthForm mode="login" admin />
        </Suspense>
      </div>
    </div>
  );
}
