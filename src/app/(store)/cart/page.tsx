import type { Metadata } from "next";
import { CartView } from "@/components/CartView";

export const metadata: Metadata = { title: "Your cart" };

export default function CartPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8">
      <h1 className="text-5xl font-[800] text-basil-deep">Your cart</h1>
      <CartView />
    </div>
  );
}
