import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A deliberately LIGHTWEIGHT guard, NOT a copy of
 * `lib/{decay,contradiction,store}/__tests__/architecture.test.ts` (that
 * file is a real TypeScript-compiler-based import scanner, "hardened over
 * three rounds and seven bypasses," and this milestone's own brief says to
 * copy it VERBATIM for a FROZEN `lib/**` directory — copying it here would
 * misrepresent this file as having earned that same hardening, for a
 * directory (`domains/**`) that is not frozen and changes shape with every
 * new predicate this domain adds).
 *
 * WHAT THIS PROVES, PRECISELY: no source file under `domains/` contains a
 * literal reference to a real LLM/model client package, a raw network
 * primitive, or a common HTTP client library. This is `PLAN.md`'s own M6
 * outcome made checkable: "natural-language-ish facts in (already parsed
 * to typed `Memory` candidates — no LLM inside `lib/`" — extended here, by
 * this domain's own choice, to cover `domains/` too, since `FactInput`
 * (facts.ts) is specifically designed to be what a real parsing step would
 * hand this domain, and the whole point is demonstrated by this domain
 * never calling out to one itself.
 *
 * WHAT THIS DOES NOT PROVE: a determined bypass (a dynamically-constructed
 * string, a re-exported wrapper package with an innocuous name) would slip
 * past a source-text scan exactly as it would past any regex-based guard.
 * That is the honest limit of a lightweight text scan, stated plainly
 * rather than oversold — see this milestone's own build report for why
 * the full compiler-based scanner was not reproduced here.
 */

const DOMAINS_ROOT = join(import.meta.dirname, "..", "..");

const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /\bfrom\s+["']openai["']/,
  /\bfrom\s+["']@anthropic-ai\//,
  /\bfrom\s+["']node:https?["']/,
  /\bfrom\s+["']axios["']/,
  /\bglobalThis\.fetch\b/,
  /\bfetch\(/,
];

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__tests__") continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (entry.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

describe("domains/personal-assistant/** — no LLM client, no network primitive, anywhere in production source", () => {
  const files = listSourceFiles(DOMAINS_ROOT);

  it("scanned at least the files this suite itself knows about (sanity check the scan isn't vacuous)", () => {
    expect(files.length).toBeGreaterThanOrEqual(7); // vocabulary, provenance, timestamps, ids, facts, store, baseline, index
  });

  it("contains no forbidden import or network call in any production (non-__tests__) source file", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf-8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(text)) {
          offenders.push(`${file}: matched ${pattern}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
