import { describe, it, expect } from "vitest";
import { toSkipTake, paginated, booleanQuery } from "../../src/lib/pagination.js";

describe("toSkipTake", () => {
  it("berechnet skip/take aus page/pageSize", () => {
    expect(toSkipTake({ page: 1, pageSize: 20 })).toEqual({ skip: 0, take: 20 });
    expect(toSkipTake({ page: 3, pageSize: 20 })).toEqual({ skip: 40, take: 20 });
  });
});

describe("paginated", () => {
  it("rundet totalPages korrekt auf", () => {
    const result = paginated([1, 2], 21, { page: 1, pageSize: 20 });
    expect(result.total).toBe(21);
    expect(result.totalPages).toBe(2);
    expect(result.data).toEqual([1, 2]);
  });
});

describe("booleanQuery", () => {
  it("parst String-Booleans korrekt (kein 'false' -> true Bug)", () => {
    expect(booleanQuery.parse("true")).toBe(true);
    expect(booleanQuery.parse("1")).toBe(true);
    expect(booleanQuery.parse("false")).toBe(false);
    expect(booleanQuery.parse("0")).toBe(false);
    expect(booleanQuery.parse(undefined)).toBe(false);
  });

  it("lehnt unerwartete Werte ab", () => {
    expect(() => booleanQuery.parse("yes")).toThrow();
  });
});
