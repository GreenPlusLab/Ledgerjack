import { describe, it, expect } from "vitest";
import type { Entry } from "../src/lib/bookscheck/entries";
import {
  resolvePeriod, answerQuery, parseBooksQuery, categoriesFor, describeAnswer,
} from "../src/lib/insights/ask";

let n = 0;
const e = (over: Partial<Entry>): Entry => ({
  id: `a${++n}`, date: "2026-09-10", description: "Item", kind: "expense", category: "Travel",
  amountCents: 1000, hasReceipt: true, isMileage: false, pending: false, ...over,
});
const money = (c: number) => `£${(c / 100).toFixed(2)}`;
const UK = { month: 4, day: 6 };
const TODAY = "2026-10-19";

describe("resolvePeriod", () => {
  it("works out each period for the UK", () => {
    expect(resolvePeriod("this-month", TODAY, UK)).toEqual({ from: "2026-10-01", to: "2026-10-19" });
    expect(resolvePeriod("last-month", TODAY, UK)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(resolvePeriod("last-3-months", TODAY, UK)).toEqual({ from: "2026-07-01", to: "2026-09-30" });
    expect(resolvePeriod("this-year", TODAY, UK)).toEqual({ from: "2026-04-06", to: "2026-10-19" });
    expect(resolvePeriod("last-year", TODAY, UK)).toEqual({ from: "2025-04-06", to: "2026-04-05" });
  });

  it("handles February and a calendar-year region", () => {
    expect(resolvePeriod("last-month", "2028-03-02", UK)).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(resolvePeriod("last-year", "2026-10-19", { month: 1, day: 1 })).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(resolvePeriod("last-3-months", "2027-01-15", UK)).toEqual({ from: "2026-10-01", to: "2026-12-31" });
  });
});

describe("answerQuery", () => {
  const entries = [
    e({ date: "2026-09-02", amountCents: 4500, description: "Shell fuel" }),
    e({ date: "2026-09-20", amountCents: 1200, description: "Parking", category: "Parking" }),
    e({ date: "2026-08-30", amountCents: 3000, description: "BP" }),
    e({ date: "2026-09-25", amountCents: 7000, description: "Shell", pending: true }),
    e({ date: "2026-09-15", amountCents: 50000, kind: "income", category: "Sales", description: "Uber" }),
  ];

  it("adds up a category for a period, leaving out pending entries but counting them", () => {
    const a = answerQuery(entries, { measure: "spent", category: "Travel", period: "last-month" }, TODAY, UK);
    expect(a.totalCents).toBe(4500);
    expect(a.count).toBe(1);
    expect(a.pendingCount).toBe(1);
    expect(describeAnswer(a, money, "tax year")).toBe("You spent £45.00 on Travel last month (2026-09-01 to 2026-09-30), across 1 entry.");
  });

  it("answers for everything, and for income", () => {
    const all = answerQuery(entries, { measure: "spent", category: "all", period: "this-year" }, TODAY, UK);
    expect(all.totalCents).toBe(8700);
    expect(all.largest.map((l) => l.amountCents)).toEqual([4500, 3000, 1200]);
    const earned = answerQuery(entries, { measure: "earned", category: "all", period: "this-year" }, TODAY, UK);
    expect(describeAnswer(earned, money, "tax year")).toBe("You earned £500.00 this tax year so far (2026-04-06 to 2026-10-19), across 1 entry.");
  });

  it("says so plainly when there's nothing", () => {
    const a = answerQuery(entries, { measure: "spent", category: "Parking", period: "this-month" }, TODAY, UK);
    expect(describeAnswer(a, money, "tax year")).toBe("Nothing spent on Parking this month so far (2026-10-01 to 2026-10-19).");
  });
});

describe("parseBooksQuery (the gate for any future AI layer)", () => {
  const cats = ["Parking", "Travel"];
  it("accepts a valid query and normalises the category", () => {
    expect(parseBooksQuery({ measure: "spent", category: "travel", period: "last-month" }, cats))
      .toEqual({ measure: "spent", category: "Travel", period: "last-month" });
    expect(parseBooksQuery({ measure: "earned", category: "all", period: "this-year" }, cats)).not.toBeNull();
  });
  it("refuses anything else", () => {
    expect(parseBooksQuery(null, cats)).toBeNull();
    expect(parseBooksQuery("how much tax do I owe?", cats)).toBeNull();
    expect(parseBooksQuery({ measure: "tax", category: "all", period: "this-year" }, cats)).toBeNull();
    expect(parseBooksQuery({ measure: "spent", category: "Holidays", period: "this-year" }, cats)).toBeNull();
    expect(parseBooksQuery({ measure: "spent", category: "all", period: "forever" }, cats)).toBeNull();
  });
});

describe("categoriesFor", () => {
  it("lists the user's own categories for each measure", () => {
    const entries = [e({ category: "Travel" }), e({ category: "Phone" }), e({ category: "Travel" }), e({ kind: "income", category: "Sales" })];
    expect(categoriesFor(entries, "spent")).toEqual(["Phone", "Travel"]);
    expect(categoriesFor(entries, "earned")).toEqual(["Sales"]);
  });
});
