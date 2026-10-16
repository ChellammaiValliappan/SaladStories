import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md px-4 pt-12">
      <h1 className="text-5xl font-[800] text-basil-deep">Welcome back</h1>
      <p className="mt-2 text-ink-soft">Sign in to see your orders and use saved addresses. You can also check out as a guest.</p>
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </div>
  );
}
