import { describe, it, expect } from "vitest";
import { toEntries, fiscalYearWindow, monthsBetween, type Entry } from "../src/lib/bookscheck/entries";
import {
  findPossibleDuplicates,
  findUnusualAmounts,
  findFutureDates,
  findMissingReceipts,
  findQuietMonths,
  runBooksCheck,
  describeFinding,
  describeItem,
  overallStatus,
  similarDescriptions,
} from "../src/lib/bookscheck/bookscheck";
import type { TransactionWithSplits } from "../src/lib/db";

let n = 0;
function e(over: Partial<Entry>): Entry {
  n++;
  return {
    id: over.id ?? `t${n}`,
    date: "2026-06-10",
    description: "Item",
    kind: "expense",
    category: "Travel",
    amountCents: 1000,
    hasReceipt: true,
    isMileage: false,
    pending: false,
    ...over,
  };
}

const money = (c: number) => `£${(c / 100).toFixed(2)}`;
const YEAR = { from: "2026-04-06", to: "2027-04-05" };

describe("toEntries", () => {
  const types = new Map([
    ["Income:Sales", "INCOME" as const],
    ["Expenses:Travel:Fuel", "EXPENSE" as const],
    ["Assets:Bank", "ASSET" as const],
  ]);
  const tx = (id: string, splits: [string, number][], extra: Partial<TransactionWithSplits> = {}): TransactionWithSplits => ({
    id, date: "2026-05-01", description: "x", pending_review: false, is_locked: false, last_modified: 0,
    splits: splits.map(([account_id, amount], i) => ({ id: `${id}-${i}`, transaction_id: id, account_id, amount, memo: null })),
    ...extra,
  });

  it("reads an expense, its category and the receipt flag", () => {
    const [en] = toEntries([tx("a", [["Expenses:Travel:Fuel", 4550], ["Assets:Bank", -4550]], { attachment_id: "r1" })], types, new Set());
    expect(en.kind).toBe("expense");
    expect(en.category).toBe("Travel");
    expect(en.amountCents).toBe(4550);
    expect(en.hasReceipt).toBe(true);
  });

  it("reads income as a positive amount", () => {
    const [en] = toEntries([tx("b", [["Assets:Bank", 12000], ["Income:Sales", -12000]])], types, new Set());
    expect(en.kind).toBe("income");
    expect(en.amountCents).toBe(12000);
  });

  it("treats a transfer as other, and marks mileage and pending", () => {
    const [en] = toEntries([tx("c", [["Assets:Bank", 500], ["Assets:Cash", -500]], { pending_review: true })], types, new Set(["c"]));
    expect(en.kind).toBe("other");
    expect(en.amountCents).toBe(0);
    expect(en.isMileage).toBe(true);
    expect(en.pending).toBe(true);
  });

  it("falls back to the account path when an account isn't in the chart", () => {
    const [en] = toEntries([tx("d", [["Expenses:Phone", 2000], ["Assets:Bank", -2000]])], new Map(), new Set());
    expect(en.kind).toBe("expense");
    expect(en.category).toBe("Phone");
  });
});

describe("dates", () => {
  it("UK tax year runs 6 April to 5 April", () => {
    expect(fiscalYearWindow(4, 6, "2026-10-19")).toEqual({ from: "2026-04-06", to: "2027-04-05" });
    expect(fiscalYearWindow(4, 6, "2026-04-05")).toEqual({ from: "2025-04-06", to: "2026-04-05" });
    expect(fiscalYearWindow(1, 1, "2026-10-19")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });
  it("lists months across a year end", () => {
    expect(monthsBetween("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });
});

describe("possible duplicates", () => {
  it("pairs a scanned receipt with the same bank line a day later", () => {
    const a = e({ id: "receipt", date: "2026-06-10", description: "Shell fuel", amountCents: 4550 });
    const b = e({ id: "bank", date: "2026-06-11", description: "CARD PAYMENT TO SHELL 1234", amountCents: 4550, pending: true, hasReceipt: false });
    const items = findPossibleDuplicates([a, b], YEAR.from, YEAR.to);
    expect(items).toHaveLength(1);
    expect([items[0].txId, items[0].relatedTxId].sort()).toEqual(["bank", "receipt"]);
  });

  it("pairs same-day, same-category entries even with different words", () => {
    const items = findPossibleDuplicates([
      e({ date: "2026-06-10", description: "Parking", amountCents: 350 }),
      e({ date: "2026-06-10", description: "NCP", amountCents: 350 }),
    ], YEAR.from, YEAR.to);
    expect(items).toHaveLength(1);
  });

  it("does not pair regular purchases a week apart", () => {
    const items = findPossibleDuplicates([
      e({ date: "2026-06-01", description: "Shell fuel", amountCents: 4000 }),
      e({ date: "2026-06-08", description: "Shell fuel", amountCents: 4000 }),
    ], YEAR.from, YEAR.to);
    expect(items).toHaveLength(0);
  });

  it("does not pair different amounts, or income with an expense", () => {
    expect(findPossibleDuplicates([
      e({ description: "Shell", amountCents: 4000 }),
      e({ description: "Shell", amountCents: 4001 }),
    ], YEAR.from, YEAR.to)).toHaveLength(0);
    expect(findPossibleDuplicates([
      e({ description: "Acme", amountCents: 5000, kind: "income", category: "Sales" }),
      e({ description: "Acme", amountCents: 5000, kind: "expense" }),
    ], YEAR.from, YEAR.to)).toHaveLength(0);
  });

  it("does not pair different words on different days", () => {
    expect(findPossibleDuplicates([
      e({ date: "2026-06-10", description: "Tesco", amountCents: 1200 }),
      e({ date: "2026-06-11", description: "Screwfix", amountCents: 1200 }),
    ], YEAR.from, YEAR.to)).toHaveLength(0);
  });

  it("uses each entry in only one pair", () => {
    const items = findPossibleDuplicates([
      e({ date: "2026-06-10", description: "Shell", amountCents: 4000 }),
      e({ date: "2026-06-10", description: "Shell", amountCents: 4000 }),
      e({ date: "2026-06-10", description: "Shell", amountCents: 4000 }),
    ], YEAR.from, YEAR.to);
    expect(items).toHaveLength(1);
  });

  it("ignores filler words when comparing descriptions", () => {
    expect(similarDescriptions("Card payment to Tesco", "Card payment to Screwfix")).toBe(false);
    expect(similarDescriptions("Screwfix Ltd", "SCREWFIX DIRECT")).toBe(true);
  });
});

describe("unusual amounts", () => {
  const history = [1200, 1500, 1300, 1400, 1250].map((c, i) => e({ date: `2026-05-0${i + 1}`, amountCents: c, category: "Phone" }));

  it("flags an extra zero", () => {
    const typo = e({ id: "typo", date: "2026-06-15", amountCents: 13000, category: "Phone" });
    const items = findUnusualAmounts([...history, typo], YEAR.from, YEAR.to);
    expect(items.map((i) => i.txId)).toEqual(["typo"]);
    expect(items[0].typicalCents).toBe(1300);
  });

  it("ignores small absolute gaps, like £2 parking against £8", () => {
    const parking = [200, 200, 250, 200, 220].map((c) => e({ amountCents: c, category: "Parking" }));
    const items = findUnusualAmounts([...parking, e({ amountCents: 800, category: "Parking" })], YEAR.from, YEAR.to);
    expect(items).toHaveLength(0);
  });

  it("needs enough history before judging", () => {
    const few = [1000, 1100, 1200].map((c) => e({ amountCents: c, category: "Tools" }));
    expect(findUnusualAmounts([...few, e({ amountCents: 90000, category: "Tools" })], YEAR.from, YEAR.to)).toHaveLength(0);
  });

  it("only flags entries inside the period", () => {
    const old = e({ id: "old", date: "2025-12-01", amountCents: 13000, category: "Phone" });
    expect(findUnusualAmounts([...history, old], YEAR.from, YEAR.to)).toHaveLength(0);
  });

  it("ignores pending entries", () => {
    const typo = e({ date: "2026-06-15", amountCents: 13000, category: "Phone", pending: true });
    expect(findUnusualAmounts([...history, typo], YEAR.from, YEAR.to)).toHaveLength(0);
  });
});

describe("future dates", () => {
  it("flags a year typo but allows tomorrow (time zones)", () => {
    const items = findFutureDates([
      e({ id: "typo", date: "2027-06-10" }),
      e({ id: "tomorrow", date: "2026-10-20" }),
      e({ id: "today", date: "2026-10-19" }),
    ], "2026-10-19");
    expect(items.map((i) => i.txId)).toEqual(["typo"]);
  });
});

describe("missing receipts", () => {
  it("lists expenses without a receipt, biggest first, skipping mileage, income and pending", () => {
    const items = findMissingReceipts([
      e({ id: "small", amountCents: 500, hasReceipt: false }),
      e({ id: "big", amountCents: 9000, hasReceipt: false }),
      e({ id: "has", amountCents: 9000, hasReceipt: true }),
      e({ id: "miles", amountCents: 4500, hasReceipt: false, isMileage: true }),
      e({ id: "inc", amountCents: 4500, hasReceipt: false, kind: "income", category: "Sales" }),
      e({ id: "pend", amountCents: 4500, hasReceipt: false, pending: true }),
    ], YEAR.from, YEAR.to);
    expect(items.map((i) => i.txId)).toEqual(["big", "small"]);
  });
});

describe("quiet months", () => {
  it("names complete months with no income or no expenses", () => {
    const entries = [
      e({ date: "2026-04-10", kind: "income", category: "Sales" }),
      e({ date: "2026-04-12" }),
      e({ date: "2026-05-10", kind: "income", category: "Sales" }),
      // June: nothing at all
      e({ date: "2026-07-03" }), // July: expenses only
      e({ date: "2026-08-03", kind: "income", category: "Sales" }),
      e({ date: "2026-08-04" }),
      e({ date: "2026-09-03", kind: "income", category: "Sales" }),
      e({ date: "2026-09-04" }),
    ];
    const items = findQuietMonths(entries, YEAR.from, YEAR.to, "2026-10-19");
    expect(items.map((i) => [i.date, i.missing])).toEqual([
      ["2026-05", ["expenses"]],
      ["2026-06", ["income", "expenses"]],
      ["2026-07", ["income"]],
    ]);
    const f = { id: "quiet-months" as const, severity: "info" as const, items };
    expect(describeItem(f, items[1], money)).toBe("June 2026: no income or expenses recorded");
  });

  it("does not count the current, unfinished month or months before the first entry", () => {
    const entries = [
      e({ date: "2026-08-10", kind: "income", category: "Sales" }),
      e({ date: "2026-08-12" }),
      e({ date: "2026-09-10", kind: "income", category: "Sales" }),
      e({ date: "2026-09-12" }),
    ];
    expect(findQuietMonths(entries, YEAR.from, YEAR.to, "2026-10-19")).toHaveLength(0);
  });

  it("stays quiet for a brand-new user", () => {
    expect(findQuietMonths([e({ date: "2026-10-01" })], YEAR.from, YEAR.to, "2026-10-19")).toHaveLength(0);
  });
});

describe("runBooksCheck", () => {
  it("is clear for tidy books", () => {
    const r = runBooksCheck([e({ date: "2026-09-01" }), e({ date: "2026-10-01", amountCents: 1100 })], { ...YEAR, today: "2026-10-19" });
    expect(r.findings).toHaveLength(0);
    expect(overallStatus(r)).toBe("clear");
  });

  it("puts things to check before information, and totals receipts", () => {
    const r = runBooksCheck([
      e({ date: "2026-09-01", amountCents: 2000, hasReceipt: false }),
      e({ date: "2027-09-01" }),
    ], { ...YEAR, today: "2026-10-19" });
    expect(r.findings.map((f) => f.id)).toEqual(["future-dates", "no-receipt"]);
    expect(r.findings[1].totalCents).toBe(2000);
    expect(overallStatus(r)).toBe("check");
  });

  it("never changes the entries it is given", () => {
    const input = [e({ date: "2026-09-01", hasReceipt: false })];
    const copy = JSON.parse(JSON.stringify(input));
    runBooksCheck(input, { ...YEAR, today: "2026-10-19" });
    expect(input).toEqual(copy);
  });
});

describe("wording", () => {
  it("describes findings in plain English with the user's currency", () => {
    const r = runBooksCheck([
      e({ date: "2026-09-01", amountCents: 2000, hasReceipt: false }),
      e({ date: "2026-09-02", amountCents: 1550, hasReceipt: false }),
    ], { ...YEAR, today: "2026-10-19" });
    const f = r.findings.find((x) => x.id === "no-receipt")!;
    expect(describeFinding(f, money).summary).toContain("2 expenses (£35.50) have no receipt photo");
    expect(describeItem(f, f.items[0], money)).toBe("2026-09-01 · £20.00 · Item");
  });

  it("never mentions a tax rate or allowance", () => {
    const all = runBooksCheck([
      e({ date: "2026-09-01", description: "Shell", amountCents: 2000, hasReceipt: false }),
      e({ date: "2026-09-01", description: "Shell", amountCents: 2000, hasReceipt: false }),
      e({ date: "2027-09-01" }),
      e({ date: "2026-09-03", pending: true }),
    ], { ...YEAR, today: "2026-10-19" });
    for (const f of all.findings) {
      const t = describeFinding(f, money);
      expect(`${t.title} ${t.summary}`).not.toMatch(/%|rate|allowance|deductible|HMRC says|you must claim/i);
    }
  });
});

describe("accountant note lines", () => {
  it("lists likely mistakes but only counts receipts and pending entries", async () => {
    const { checksNoteLines } = await import("../src/lib/bookscheck/bookscheck");
    const r = runBooksCheck([
      e({ date: "2026-09-01", description: "Shell", amountCents: 2000 }),
      e({ date: "2026-09-01", description: "Shell", amountCents: 2000 }),
      ...Array.from({ length: 30 }, (_, i) => e({ date: "2026-09-05", description: `Bank line ${i}`, amountCents: 100 + i, hasReceipt: false })),
      e({ date: "2026-09-03", pending: true, amountCents: 999 }),
    ], { ...YEAR, today: "2026-10-19" });
    const text = checksNoteLines(r, money).join("\n");
    expect(text).toContain("Possible duplicates: 1 (£20.00)");
    expect(text).toContain('£20.00: "Shell" (2026-09-01) and "Shell" (2026-09-01)');
    expect(text).toContain("Expenses without a receipt: 30");
    expect(text).not.toContain("Bank line 7");
    expect(text).toContain("Waiting for your review: 1");
  });

  it("says so when nothing stood out", async () => {
    const { checksNoteLines } = await import("../src/lib/bookscheck/bookscheck");
    const r = runBooksCheck([e({ date: "2026-09-01" })], { ...YEAR, today: "2026-10-19" });
    expect(checksNoteLines(r, money).join("\n")).toContain("Nothing stood out");
  });
});

describe("medianWithout", () => {
  it("matches a plain median of the remaining values", async () => {
    const { medianWithout } = await import("../src/lib/bookscheck/bookscheck");
    const plain = (xs: number[]) => {
      const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
    };
    let seed = 7;
    const rnd = () => (seed = (seed * 48271) % 2147483647) % 500;
    for (let t = 0; t < 300; t++) {
      const xs = Array.from({ length: 2 + (t % 9) }, rnd);
      const sorted = [...xs].sort((a, b) => a - b);
      for (let i = 0; i < xs.length; i++) {
        const rest = xs.filter((_, j) => j !== i);
        expect(medianWithout(sorted, xs[i])).toBe(plain(rest));
      }
    }
  });

  it("stays fast for a big category", () => {
    const big = Array.from({ length: 5000 }, (_, i) => e({ date: "2026-06-01", amountCents: 1000 + (i % 50), category: "Fuel" }));
    const t0 = Date.now();
    findUnusualAmounts([...big, e({ date: "2026-06-02", amountCents: 50000, category: "Fuel" })], YEAR.from, YEAR.to);
    expect(Date.now() - t0 < 1000).toBe(true);
  });
});

describe("possible duplicates at scale", () => {
  it("handles a year of identical daily parking quickly and without false pairs", () => {
    const days = Array.from({ length: 2000 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 3, 6 + i * 4)); // every 4 days
      return e({ date: d.toISOString().slice(0, 10), description: "Parking", amountCents: 350, category: "Parking" });
    });
    const t0 = Date.now();
    const items = findPossibleDuplicates(days, "2026-01-01", "2049-12-31");
    expect(items).toHaveLength(0);
    expect(Date.now() - t0 < 1000).toBe(true);
  });
});
