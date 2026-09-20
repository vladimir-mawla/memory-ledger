import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "memory-ledger",
  description:
    "Memory that knows it might be wrong: a typed, append-only store of beliefs with source, confidence, freshness, scope, and an explicit, provable forgetting policy.",
};

/**
 * Minimal App Router shell — infrastructure only, mirroring decision-
 * engine's and shadow-run's own root layout shape. No project-specific UI
 * exists yet (that is M8's job); this file's only reason to exist at M1 is
 * so app/ has at least one real entry point for `npm run typecheck`
 * (tsconfig.json) and `npm run build` to check, ahead of M2 adding
 * app/api/health/**.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
