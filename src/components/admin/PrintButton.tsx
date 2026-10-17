"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn btn-ghost min-h-11 text-sm">
      <Printer className="h-4 w-4" /> Print
    </button>
  );
}
