import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * M7 CASE 10 — answering the task's own question: "`Memory.status` is
 * never read by any engine. M6 recorded this as a forward finding. Is
 * that worth a test asserting no engine reads it — and can such a test be
 * honest, given it is a claim about absence?"
 *
 * ANSWER: yes, worth pinning (a silent regression here would mean some
 * future engine change quietly started branching on a LIVE memory's own
 * `"believed"|"doubted"|"disputed"` label instead of recomputing the
 * equivalent fact from `decay()`/`contradict()` — exactly the kind of
 * drift `domains/personal-assistant/facts.ts`'s own header already flags
 * as a real, checked finding, not a hypothetical worth ignoring), and yes
 * — the SAME way `shadow-run/tests/failures/case-5-gate-never-
 * consulted.test.ts` answers the identical shape of question for its own
 * "is the gate ever consulted" claim: as an HONEST PARTIAL PIN, a
 * textual, architectural search over TODAY's committed, non-test source,
 * never a claim about what code could ever be written.
 *
 * CHECKED, NOT ASSUMED, BEFORE WRITING THIS FILE: `git grep -n '\.status'`
 * over `lib/contracts`, `lib/decay`, `lib/contradiction`, `lib/store`, and
 * `domains/personal-assistant` (all non-test source) finds exactly FOUR
 * live occurrences, and every one of them is a DIFFERENT field than the
 * one this case is about:
 *   - `lib/contracts/effective-confidence.ts:96` and `lib/decay/
 *     query-confidence.ts:83` — both `record.status === "tombstoned"`,
 *     the type-level DISCRIMINANT between `Memory` and `TombstonedMemory`
 *     (checking for the ONE status value that is NOT a member of
 *     `Memory.status`'s own union at all), never a read of a live
 *     memory's `"believed"`/`"doubted"`/`"disputed"` label to decide
 *     anything.
 *   - `lib/store/belief-query.ts:239` and `:250` — `result.status ===
 *     "forgettable"` / `"doubted"`, both reads of `DecayResult.status`
 *     (`lib/decay/decay.ts`'s own, deliberately DIFFERENT three-member
 *     union — that file's own header: "NOT `Memory.status`... the two
 *     unions look similar but are deliberately different types"), never
 *     `Memory.status` itself.
 *
 * A FALSE POSITIVE, FOUND WHILE BUILDING THIS FILE, NOT PAPERED OVER: an
 * earlier draft of the regex below also matched bare `case "believed":`/
 * `case "disputed":` lines, reasoning that a `switch` branching on either
 * literal was equally suspicious wherever it appeared. Run against the
 * real tree, it flagged `lib/store/belief-query.ts`'s own `switch (check
 * .outcome) { ...; case "disputed": case "not-comparable": ... }` — a
 * `switch` over `ContradictionCheck.outcome` (contradiction-check.ts),
 * which happens to share the string `"disputed"` with `Memory.status`
 * but is a completely different field on a completely different type.
 * A purely textual, line-by-line regex cannot tell "a `case` label
 * belonging to a `switch` over `Memory.status`" apart from "a `case`
 * label belonging to a `switch` over anything else that happens to use
 * the same string" without real parsing — so rather than special-case
 * this one known false positive (which would only hide the NEXT
 * unrelated `switch` that reuses either literal), the `case` leg is
 * dropped entirely below. What remains is narrower but sound: a
 * `status === "literal"` comparison. Zero occurrences of that
 * (`"believed"`/`"disputed"`) exist anywhere in this scan.
 *
 * A SECOND GAP, FOUND BY INDEPENDENT VERIFICATION AFTER THIS FILE WAS
 * FIRST APPROVED, DISCLOSED HERE RATHER THAN LEFT IMPLICIT IN "reflection
 * / renamed re-export" BELOW: the original regex required a literal `.`
 * immediately before `status` (`\.status\s*===...`), so a DESTRUCTURED
 * read — `const { status } = candidates[0]; if (status === "believed")`
 * — walked straight through, unflagged. This is not an exotic bypass; it
 * is ordinary, everyday TypeScript, arguably MORE idiomatic than a
 * repeated `.status` property chain. An absence claim whose own disclosed
 * limits list only "reflection" and "a renamed re-export" while missing
 * the single most common way to read a field in this language would be
 * understating the gap, not merely leaving one open — the same failure
 * this account has been corrected for before in the other direction
 * (overstating a caveat). CLOSED, not merely disclosed, because closing
 * it turned out to be cheap and did not reintroduce the `switch`/`case`
 * false positive above (that false positive was about a `case` LABEL
 * matching a string irrespective of what it switches on; this fix is
 * about the LEFT-HAND SIDE of a direct comparison, an unrelated axis):
 * the pattern below now matches `status` as a bare word-boundary token,
 * not only when preceded by a literal `.` — so both `object.status ===
 * "believed"` and a destructured bare `status === "believed"` are caught
 * by the same rule, while `myStatus`/`DecayStatus`-shaped identifiers
 * (which do not end in a word-boundary immediately before "status", or
 * are wrong case) are not. Checked directly against every real
 * non-comparison use of the word `status` already in this codebase's
 * scanned roots (object-literal CONSTRUCTION — `{ status: "believed" }`
 * — and a renaming destructure that discards the value — `const {
 * status: _status, ...core } = memory` — appear in `lib/store/forget.ts`,
 * `domains/personal-assistant/store.ts`, and `lib/store/belief-query.ts`
 * itself): none of these are direct `status === "literal"` COMPARISONS,
 * so none of them are flagged by the broadened pattern either — the
 * "does NOT overtighten" block below proves this, not just asserts it.
 *
 * WHAT THIS PROVES AND DOES NOT, STATED PRECISELY: this PROVES that no
 * non-test source file under the five scanned roots TEXTUALLY contains a
 * direct comparison — via a property access OR a destructured local — of
 * a value named `status` against `"believed"` or `"disputed"` (the two
 * live-only labels — `"doubted"` is deliberately excluded from the
 * regex, since `DecayResult.status` legitimately shares that ONE literal
 * with `Memory.status`, and a textual match on `"doubted"` alone cannot
 * tell the two apart; `believed`/`disputed` are unambiguous because
 * `DecayResult.status` never uses them). It does NOT prove no `switch`
 * anywhere branches on `Memory.status` (the false positive above is
 * exactly why that leg was removed rather than patched — a `switch`
 * check would need to verify WHICH type's field is being switched on,
 * which this file does not attempt). It STILL does not prove no engine
 * could ever be written to branch on `Memory.status` some other way:
 * reflection (`obj["status"]` via a computed/concatenated string),
 * a renamed re-export chased through a second indirection layer, or a
 * comparison against a variable holding the string `"believed"` rather
 * than the literal itself, would all be invisible to this textual check
 * — the same disclosed class of gap this codebase's own `lib/store/
 * __tests__/architecture.test.ts` names for its own scans (before that
 * file's later AST-based rewrite, which this one does not attempt to
 * replicate at that same cost for a single, narrow absence claim). Stated
 * at full strength, not softened: destructuring was the ordinary case
 * this list should have named from the start, and reflection/renaming/
 * indirection remain genuinely exotic by comparison.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const SCAN_ROOTS: readonly string[] = [
  join(REPO_ROOT, "lib", "contracts"),
  join(REPO_ROOT, "lib", "decay"),
  join(REPO_ROOT, "lib", "contradiction"),
  join(REPO_ROOT, "lib", "store"),
  join(REPO_ROOT, "domains", "personal-assistant"),
];

function listNonTestSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      files.push(...listNonTestSourceFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

/** Matches a direct `status === "believed"`/`"disputed"` comparison (either quote style, `==` or `===`), whether `status` is reached via a property access (`.status`) or a bare, destructured local — the two unambiguous live-Memory-only status labels. `\bstatus\b` (not `\.status`) is what closes the destructuring gap; see file header for why `"doubted"` is excluded, why a `switch`/`case` leg was tried and removed after a real false positive, and why broadening the left-hand side does not reintroduce it. */
const OFFENDING_PATTERN = /\bstatus\s*={2,3}\s*["'](believed|disputed)["']/g;

interface Offender {
  readonly file: string;
  readonly line: number;
  readonly match: string;
}

function scan(): Offender[] {
  const offenders: Offender[] = [];
  for (const root of SCAN_ROOTS) {
    for (const file of listNonTestSourceFiles(root)) {
      const contents = readFileSync(file, "utf8");
      const lines = contents.split("\n");
      lines.forEach((line, i) => {
        OFFENDING_PATTERN.lastIndex = 0;
        const match = OFFENDING_PATTERN.exec(line);
        if (match) {
          offenders.push({ file: file.slice(REPO_ROOT.length + 1), line: i + 1, match: match[0] });
        }
      });
    }
  }
  return offenders;
}

describe("Case 10 — HONEST PARTIAL PIN: no non-test source under lib/contracts, lib/decay, lib/contradiction, lib/store, or domains/personal-assistant textually branches on a live Memory's own status", () => {
  it("the scan finds zero offenders today", () => {
    const offenders = scan();
    if (offenders.length > 0) {
      const report = offenders.map((o) => `${o.file}:${o.line}: ${o.match}`).join("\n");
      throw new Error(`Found ${offenders.length} place(s) that appear to branch on a live Memory's own status label:\n${report}`);
    }
    expect(offenders).toEqual([]);
  });

  it("SANITY CHECK on the check itself: the pattern DOES match a planted offender -- proving this is a real, working search, not a vacuously-passing one over an empty or wrongly-scoped pattern", () => {
    OFFENDING_PATTERN.lastIndex = 0;
    expect(OFFENDING_PATTERN.test('if (memory.status === "believed") { doSomething(); }')).toBe(true);
    OFFENDING_PATTERN.lastIndex = 0;
    expect(OFFENDING_PATTERN.test("if (candidate.status == 'disputed') { flag(); }")).toBe(true);
  });

  it("REGRESSION for the false positive found while building this file: a switch's case label sharing the word \"disputed\" with an UNRELATED field (ContradictionCheck.outcome, not Memory.status) is correctly NOT flagged, now that the case-based leg has been removed", () => {
    OFFENDING_PATTERN.lastIndex = 0;
    expect(OFFENDING_PATTERN.test('switch (check.outcome) {\n  case "disputed":\n  case "not-comparable":')).toBe(false);
  });

  it("REGRESSION for the gap independent verification found after first approval: a destructured, bare `status` compared to \"believed\" -- the exact shape injected during review -- is now caught", () => {
    OFFENDING_PATTERN.lastIndex = 0;
    const source = 'const { status } = candidates[0];\nif (status === "believed") { return true; }';
    expect(OFFENDING_PATTERN.test(source)).toBe(true);
    OFFENDING_PATTERN.lastIndex = 0;
    expect(OFFENDING_PATTERN.test('const { status } = memory;\nif (status === "disputed") { flag(); }')).toBe(true);
  });

  it("does NOT overtighten: the real, legitimate DecayResult.status/tombstoned-discriminant reads in this codebase are NOT flagged -- confirms the regex is scoped to \"believed\"/\"disputed\" only, not every use of the word \"status\"", () => {
    OFFENDING_PATTERN.lastIndex = 0;
    expect(OFFENDING_PATTERN.test('if (record.status === "tombstoned") { return ZERO_CONFIDENCE; }')).toBe(false);
    OFFENDING_PATTERN.lastIndex = 0;
    expect(OFFENDING_PATTERN.test('if (result.status === "forgettable") { ... }')).toBe(false);
    OFFENDING_PATTERN.lastIndex = 0;
    expect(OFFENDING_PATTERN.test('if (result.status === "doubted") { ... }')).toBe(false); // the one literal DecayResult and Memory legitimately share -- deliberately excluded, see file header.
  });

  it("does NOT overtighten, against the broadened word-boundary pattern specifically: an object-literal CONSTRUCTION (`{ status: \"believed\" }`, no comparison at all) and a renaming destructure that discards the value (`const { status: _status, ...core } = memory` -- forget.ts's and store.ts's own real shape) are NOT flagged, and a similarly-named identifier that merely CONTAINS \"status\" is NOT flagged either", () => {
    OFFENDING_PATTERN.lastIndex = 0;
    expect(OFFENDING_PATTERN.test('return { status: "believed", memory, confidence };')).toBe(false); // construction, not a `===` comparison.
    OFFENDING_PATTERN.lastIndex = 0;
    expect(OFFENDING_PATTERN.test('const { status: _status, ...core } = memory;')).toBe(false); // renamed on the way out, never compared.
    OFFENDING_PATTERN.lastIndex = 0;
    expect(OFFENDING_PATTERN.test('if (mystatus === "believed") { ... }')).toBe(false); // "status" here is a SUFFIX of a longer lowercase identifier with no word boundary before it, not its own bare token.
  });

  it("sanity: the scan actually walked real files (a non-empty, real file list, not an accidentally-empty glob)", () => {
    const files = SCAN_ROOTS.flatMap((root) => listNonTestSourceFiles(root));
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((f) => f.endsWith("belief-query.ts"))).toBe(true);
    expect(files.some((f) => f.includes("__tests__"))).toBe(false);
  });
});
