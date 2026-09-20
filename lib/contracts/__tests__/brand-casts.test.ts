import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * This directory brands four types (`Confidence`, `CapturedAt`,
 * `MemoryId`, `TombstoneId`) specifically so a raw string/number can't be
 * *assigned* where a validated value is expected — but a brand built as
 * `T & { [brand]: ... }` cannot stop a deliberate cast.
 * `(x as string) as MemoryId` compiles with zero errors, which is exactly
 * the shortcut a time-pressured later milestone (M4/M5/M6) would reach
 * for instead of calling the real constructor (`parseConfidence`,
 * `parseCapturedAt`, `memoryId`, `tombstoneId`).
 *
 * Same discipline as decision-engine's own
 * `lib/contracts/__tests__/brand-casts.test.ts` (re-derived, not
 * imported): scan the actual source text under `lib/` and fail the build
 * if a defeating cast appears anywhere outside the one file that
 * legitimately performs it, inside its own brand-defining module.
 *
 * ONE DELIBERATE REFINEMENT OVER THE SIBLING'S OWN FILTER, RECORDED
 * HONESTLY: decision-engine's version excludes only files whose name ends
 * in `.test.ts`, on the reasoning that "a test file casting a literal
 * into a branded fixture is not the failure mode this test exists to
 * catch." This project's own `__tests__/fixtures.ts` is exactly that case
 * — test-only fixture construction — but its NAME does not end in
 * `.test.ts` (it is imported BY test files, not itself a suite), so a
 * name-suffix filter would incorrectly flag it as a production offender.
 * This version excludes by DIRECTORY (`/__tests__/`) instead, which
 * correctly covers `fixtures.ts` for the same underlying reason the
 * sibling's filter was written to cover `*.test.ts` — both are test
 * infrastructure, never a domain implementation's shortcut — without
 * depending on a filename convention that happens not to hold in this
 * repository. This is not a claim that the sibling's own test is wrong;
 * it simply never had a same-directory, non-`.test.ts`-suffixed fixture
 * file to expose the gap.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const LIB_ROOT = join(REPO_ROOT, "lib");

const DEFINING_FILES = new Set([
  join(REPO_ROOT, "lib", "contracts", "confidence.ts"),
  join(REPO_ROOT, "lib", "contracts", "captured-at.ts"),
  join(REPO_ROOT, "lib", "contracts", "memory-id.ts"),
  join(REPO_ROOT, "lib", "contracts", "tombstone-id.ts"),
]);

// Matches `as Confidence` / `as CapturedAt` / `as MemoryId` / `as TombstoneId`
// as a type assertion, with `\b` on both sides so it never matches as a
// substring of a longer identifier.
const CAST_PATTERN = /\bas\s+(Confidence|CapturedAt|MemoryId|TombstoneId)\b/;

function isUnderTestsDirectory(path: string): boolean {
  return path.includes(`${join("", "__tests__", "")}`) || path.split(/[/\\]/).includes("__tests__");
}

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (entry.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

function scanForBrandCasts(): string[] {
  const sourceFiles = listSourceFiles(LIB_ROOT).filter(
    (f) => !DEFINING_FILES.has(f) && !isUnderTestsDirectory(f),
  );
  const offenders: string[] = [];

  for (const file of sourceFiles) {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    lines.forEach((line, index) => {
      if (CAST_PATTERN.test(line)) {
        offenders.push(`${relative(REPO_ROOT, file)}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  return offenders;
}

describe("branded casts stay inside the file that defines the brand", () => {
  it("no `as Confidence` / `as CapturedAt` / `as MemoryId` / `as TombstoneId` cast appears in lib/ outside its own defining file or a __tests__ directory", () => {
    const offenders = scanForBrandCasts();
    if (offenders.length > 0) {
      throw new Error(
        "Found a branded type cast outside its defining file. A cast defeats the brand " +
          "(TypeScript cannot refuse an explicit `as`), so construct the value through the " +
          "real constructor instead — parseConfidence(...), parseCapturedAt(...), memoryId(...), " +
          "or tombstoneId(...):\n" +
          offenders.join("\n"),
      );
    }
    expect(offenders).toEqual([]);
  });

  it("sanity: the scan actually walks real, non-test source files, so a passing result isn't vacuous", () => {
    const sourceFiles = listSourceFiles(LIB_ROOT).filter(
      (f) => !DEFINING_FILES.has(f) && !isUnderTestsDirectory(f),
    );
    expect(sourceFiles.length).toBeGreaterThanOrEqual(8);
    expect(sourceFiles.some((f) => f.endsWith("memory.ts"))).toBe(true);
    expect(sourceFiles.some((f) => f.endsWith("tombstone.ts"))).toBe(true);
  });

  it("__tests__/fixtures.ts is excluded by directory, even though its name does not end in .test.ts — the refinement this file's own header documents", () => {
    const fixturesPath = join(REPO_ROOT, "lib", "contracts", "__tests__", "fixtures.ts");
    expect(isUnderTestsDirectory(fixturesPath)).toBe(true);
    const allFiles = listSourceFiles(LIB_ROOT);
    expect(allFiles).toContain(fixturesPath);
  });

  it("the four defining files are excluded by exact path, not swept up by a directory glob — a sibling file in the same directory is NOT exempt just by proximity", () => {
    expect(DEFINING_FILES.has(join(REPO_ROOT, "lib", "contracts", "confidence.ts"))).toBe(true);
    const sibling = join(REPO_ROOT, "lib", "contracts", "memory.ts");
    expect(DEFINING_FILES.has(sibling)).toBe(false);
  });
});
