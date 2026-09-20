import { defineConfig } from "vitest/config";

// Kept deliberately minimal: no framework plugin (no Next.js, no React)
// because lib/ must stay framework-free through M2's Next.js adoption —
// same discipline as this project's infrastructure siblings, decision-engine
// and shadow-run.
//
// Every include glob below except "lib/**/*.test.ts" is empty at M1 — this
// is the same "pre-added-ahead-of-need" precedent shadow-run's own
// vitest.config.ts documents for app/**, tests/failures/**, domains/**, and
// components/**: an empty glob costs nothing today and means this file
// never needs a second edit purely to teach vitest where a later,
// already-planned milestone's tests live.
//   - "app/**/*.test.ts"      — M2 (deploy) / M8 (UI)
//   - "domains/**/*.test.ts"  — M6 (personal-assistant adapter)
//   - "tests/**/*.test.ts"    — M7 (the failure suite; plan's own freeze
//                                boundary is tests/failures/**)
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "lib/**/*.test.ts",
      "app/**/*.test.ts",
      "domains/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    watch: false,
  },
});
