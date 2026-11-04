import { describe, it, expect } from "vitest";
import {
  checkReading, cleanDate, isRealDate, flagsOf, storedFlags, FLAG_TEXT, MUST_FIX, ALL_FLAGS, FLAG_FIELD, fieldsToCheck,
} from "../src/lib/ai/readingChecks";
import { suggestFromReceiptText } from "../src/lib/ocr/receiptText";

const today = "2026-11-03";
const fmt = (m: number) => `£${(m / 100).toFixed(2)}`;
const good = { date: "2026-10-30", amount: 2995, description: "TESCO" };
const flags = (r: Parameters<typeof checkReading>[0]) => flagsOf(checkReading(r, today, fmt));

describe("dates are never guessed", () => {
  it("keeps a real date and empties anything else", () => {
    expect(cleanDate("2026-10-30")).toBe("2026-10-30");
    expect(cleanDate(null)).toBe("");
    expect(cleanDate(undefined)).toBe("");
    expect(cleanDate("30/10/2026")).toBe("");
    expect(cleanDate("2026-02-30")).toBe("");
    expect(isRealDate("2028-02-29")).toBe(true);
  });
  it("flags a missing date as something to fill in", () => {
    expect(flags({ ...good, date: "" })).toContain("date-missing");
    expect(MUST_FIX.has("date-missing")).toBe(true);
  });
  it("flags a date after today, and one over a year old", () => {
    expect(flags({ ...good, date: "2026-11-04" })).toContain("date-future");
    expect(flags({ ...good, date: "2025-10-01" })).toContain("date-old");
    expect(flags({ ...good, date: "2026-01-15" })).toEqual([]);
  });
  it("text recognition no longer fills in today's date", () => {
    const s = suggestFromReceiptText("CORNER SHOP\nTOTAL 4.20", "DMY", today);
    expect(s.date).toBeUndefined();
    expect(s.notes.join(" ")).toMatch(/No date was found\. Please add it/);
    expect(s.notes.join(" ")).not.toMatch(/today/);
  });
});

describe("the numbers are checked against each other", () => {
  it("says exactly how far the items are from the total", () => {
    const issues = checkReading({ ...good, itemTotals: [1500, 1240] }, today, fmt);
    expect(issues.map((i) => i.flag)).toEqual(["items-mismatch"]);
    expect(issues[0]!.message).toContain("£27.40");
    expect(issues[0]!.message).toContain("£29.95");
  });
  it("allows a penny of rounding per item", () => {
    expect(flags({ ...good, itemTotals: [1000, 1000, 996] })).toEqual([]);
  });
  it("checks suggested parts add up", () => {
    expect(flags({ ...good, splitAmounts: [2000, 500] })).toEqual(["split-mismatch"]);
    expect(flags({ ...good, splitAmounts: [2000, 995] })).toEqual([]);
  });
  it("flags a missing or zero total as something to fill in", () => {
    expect(flags({ ...good, amount: 0 })).toContain("total-missing");
    expect(flags({ ...good, amount: -500 })).toContain("total-missing");
    expect(MUST_FIX.has("total-missing")).toBe(true);
  });
  it("flags a missing shop name", () => {
    expect(flags({ ...good, description: "" })).toContain("shop-missing");
    expect(flags({ ...good, description: "Unknown" })).toContain("shop-missing");
  });
});

describe("the AI's own score", () => {
  it("is passed on when the AI is unsure, or didn't say", () => {
    expect(flags({ ...good, amountConfidence: 0.5, categoryConfidence: 0.9 })).toEqual(["unsure-amount"]);
    expect(flags({ ...good, amountConfidence: undefined, categoryConfidence: undefined })).toEqual(["unsure-amount", "unsure-category"]);
    expect(flags({ ...good, amountConfidence: 0.8, categoryConfidence: 0.95 })).toEqual([]);
  });
  it("isn't asked of text recognition, which gives no score", () => {
    expect(flags(good)).toEqual([]);
  });
});

describe("only the part that needs a look is highlighted", () => {
  it("maps each flag to its field", () => {
    expect([...fieldsToCheck(["date-missing"])]).toEqual(["date"]);
    expect([...fieldsToCheck(["items-mismatch", "unsure-category"])].sort()).toEqual(["amount", "category"]);
    expect(fieldsToCheck([]).size).toBe(0);
    for (const f of ALL_FLAGS) expect(FLAG_FIELD[f].length).toBeGreaterThan(0);
  });
});

describe("stored flags", () => {
  it("every flag has plain wording with no amounts in it", () => {
    for (const f of ALL_FLAGS) {
      expect(FLAG_TEXT[f].length).toBeGreaterThan(20);
      expect(FLAG_TEXT[f]).not.toMatch(/£|\d/);
    }
  });
  it("ignores anything unknown when read back", () => {
    expect(storedFlags(["date-missing", "nonsense", 3])).toEqual(["date-missing"]);
    expect(storedFlags(undefined)).toEqual([]);
  });
});
