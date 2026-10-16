import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = { title: "Create an account" };

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-md px-4 pt-12">
      <h1 className="text-5xl font-[800] text-basil-deep">Create an account</h1>
      <p className="mt-2 text-ink-soft">Save your addresses, reorder in a tap and track every order. It's optional — guest checkout works too.</p>
      <Suspense>
        <AuthForm mode="register" />
      </Suspense>
    </div>
  );
}
