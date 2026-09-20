import { describe, expect, it } from "vitest";
import { scopeIsSupersetOf, type Scope } from "../scope.js";

describe("scopeIsSupersetOf", () => {
  it("a memory scoped identically to the query is eligible", () => {
    const scope: Scope = [{ dimension: "user", value: "vlad" }];
    expect(scopeIsSupersetOf(scope, scope)).toBe(true);
  });

  it("a memory scoped more broadly than the query is eligible (query scope is a subset)", () => {
    const memory: Scope = [
      { dimension: "account", value: "acme-corp" },
      { dimension: "user", value: "vlad" },
    ];
    const query: Scope = [{ dimension: "user", value: "vlad" }];
    expect(scopeIsSupersetOf(memory, query)).toBe(true);
  });

  it("a memory scoped to a DIFFERENT value on the same dimension is NOT eligible — no fuzzy match", () => {
    const memory: Scope = [{ dimension: "user", value: "vlad" }];
    const query: Scope = [{ dimension: "user", value: "sam" }];
    expect(scopeIsSupersetOf(memory, query)).toBe(false);
  });

  it("a memory missing a dimension the query requires is NOT eligible", () => {
    const memory: Scope = [{ dimension: "user", value: "vlad" }];
    const query: Scope = [
      { dimension: "user", value: "vlad" },
      { dimension: "account", value: "acme-corp" },
    ];
    expect(scopeIsSupersetOf(memory, query)).toBe(false);
  });

  it("is order-independent", () => {
    const memory: Scope = [
      { dimension: "account", value: "acme-corp" },
      { dimension: "user", value: "vlad" },
    ];
    const query: Scope = [
      { dimension: "user", value: "vlad" },
      { dimension: "account", value: "acme-corp" },
    ];
    expect(scopeIsSupersetOf(memory, query)).toBe(true);
  });

  it("never does substring or case-insensitive matching — exact string equality only", () => {
    const memory: Scope = [{ dimension: "user", value: "vlad" }];
    const query: Scope = [{ dimension: "user", value: "VLAD" }];
    expect(scopeIsSupersetOf(memory, query)).toBe(false);
    const prefixQuery: Scope = [{ dimension: "user", value: "vla" }];
    expect(scopeIsSupersetOf(memory, prefixQuery)).toBe(false);
  });

  it("an empty query scope is trivially satisfied by anything, including an empty memory scope", () => {
    expect(scopeIsSupersetOf([], [])).toBe(true);
    expect(scopeIsSupersetOf([{ dimension: "user", value: "vlad" }], [])).toBe(true);
  });

  it("TYPE-LEVEL: a ScopeEntry missing `value` does not compile", () => {
    // @ts-expect-error — ScopeEntry requires both `dimension` and `value`; this object omits `value`.
    const bad: Scope = [{ dimension: "user" }];
    void bad;
  });
});
