/**
 * Random-input ("property") tests for the money maths. Instead of a few
 * hand-picked examples, fast-check tries hundreds of random inputs per rule
 * and, if one breaks it, shrinks it to the smallest failing case.
 */
import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";

// ledger.ts opens the database at load; only its pure helpers are tested here.
vi.mock("../src/lib/db", () => ({ db: {}, loadWithSplits: vi.fn() }));
vi.mock("../src/lib/atRest", () => ({ encField: vi.fn(), encAmount: vi.fn(), canEncryptAtRest: () => false }));

import { parseCurrencyInput, formatInputValue } from "../src/lib/currency";
import { makeSimpleSplits, validateBalance } from "../src/lib/ledger";
import { toMinor, suggestFromReceiptText } from "../src/lib/ocr/receiptText";
import { checkReading, cleanDate, isRealDate, ALL_FLAGS } from "../src/lib/ai/readingChecks";
import { addEntry, parseLog, MAX_ENTRIES, type LeftEntry } from "../src/lib/privacy/leftPhone";

const RUNS = { numRuns: 500 };
/** Up to £1 billion either way, in pence. */
const pence = fc.integer({ min: -100_000_000_000, max: 100_000_000_000 });
const positivePence = fc.integer({ min: 1, max: 100_000_000_000 });
const withCommas = (minor: number) => {
  const [whole, frac] = (minor / 100).toFixed(2).split(".");
  return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac}`;
};
const isoDate = fc
  .date({ min: new Date("2000-01-01T00:00:00Z"), max: new Date("2099-12-31T00:00:00Z"), noInvalidDate: true })
  .map((d) => d.toISOString().slice(0, 10));

describe("typed amounts", () => {
  it("an amount shown in a form reads back as exactly the same pence", () => {
    fc.assert(fc.property(pence, (n) => parseCurrencyInput(formatInputValue(n)) === n), RUNS);
  });
  it("reads amounts with a pound sign and thousands commas exactly", () => {
    fc.assert(fc.property(positivePence, (n) => parseCurrencyInput(`£${withCommas(n)}`) === n), RUNS);
  });
  it("whatever is typed, the result is a whole number of pence (never NaN, never inexact)", () => {
    fc.assert(fc.property(fc.string({ maxLength: 40 }), (s) => Number.isSafeInteger(parseCurrencyInput(s))), RUNS);
    fc.assert(fc.property(fc.stringMatching(/^[0-9.,£-]{0,40}$/), (s) => Number.isSafeInteger(parseCurrencyInput(s))), RUNS);
  });
});

describe("double-entry balance", () => {
  it("a simple entry always balances to exactly zero", () => {
    fc.assert(fc.property(pence, (n) => {
      const splits = makeSimpleSplits("Expenses:Materials", "Assets:Cash", n);
      return splits.length === 2 && validateBalance(splits) && splits[0]!.amount === n && splits[1]!.amount === -n;
    }), RUNS);
  });
  it("any entry that is off by even a penny is refused", () => {
    fc.assert(fc.property(fc.array(pence, { minLength: 1, maxLength: 10 }), fc.integer({ min: 1, max: 1_000_000 }), fc.boolean(), (amounts, off, up) => {
      const balanced = [...amounts.map((amount) => ({ amount })), { amount: -amounts.reduce((a, b) => a + b, 0) }];
      expect(validateBalance(balanced)).toBe(true);
      const unbalanced = [...balanced, { amount: up ? off : -off }];
      return validateBalance(unbalanced) === false;
    }), RUNS);
  });
});

describe("amounts read from receipts", () => {
  it("reads any printed amount exactly, with or without £ and commas", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 100_000_000_000 }), (n) =>
      toMinor((n / 100).toFixed(2)) === n && toMinor(`£${withCommas(n)}`) === n), RUNS);
  });
  it("never returns an inexact or invalid number", () => {
    fc.assert(fc.property(fc.string({ maxLength: 30 }), (s) => {
      const v = toMinor(s);
      return v === null || Number.isSafeInteger(v);
    }), RUNS);
  });
  it("never crashes on any receipt text, and anything it suggests is sane", () => {
    fc.assert(fc.property(fc.string({ maxLength: 400 }), (text) => {
      const s = suggestFromReceiptText(text, "DMY", "2026-11-03");
      if (s.totalMinor !== undefined && !(Number.isSafeInteger(s.totalMinor) && s.totalMinor > 0)) return false;
      if (s.vatMinor !== undefined && s.totalMinor !== undefined && s.vatMinor > s.totalMinor) return false;
      if (s.date !== undefined && !isRealDate(s.date)) return false;
      return true;
    }), RUNS);
  });
  it("finds the total on a simple receipt", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 10_000_000 }), (n) =>
      suggestFromReceiptText(`CORNER SHOP\nTOTAL ${(n / 100).toFixed(2)}`, "DMY", "2026-11-03").totalMinor === n), RUNS);
  });
});

describe("checks on a reading", () => {
  const reading = fc.record({
    date: fc.oneof(isoDate, fc.string({ maxLength: 12 })),
    amount: fc.oneof(pence, fc.constant(Number.NaN)),
    description: fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
    itemTotals: fc.option(fc.array(pence, { maxLength: 8 }), { nil: undefined }),
    splitAmounts: fc.option(fc.array(pence, { maxLength: 4 }), { nil: undefined }),
  });
  it("never crash, and only ever raise known flags", () => {
    fc.assert(fc.property(reading, (r) => checkReading(r, "2026-11-03", String).every((i) => ALL_FLAGS.includes(i.flag))), RUNS);
  });
  it("always ask for the date when it isn't a real date", () => {
    fc.assert(fc.property(reading, (r) =>
      checkReading(r, "2026-11-03", String).some((i) => i.flag === "date-missing") === !isRealDate(r.date)), RUNS);
  });
  it("don't complain when the items add up exactly", () => {
    fc.assert(fc.property(fc.array(positivePence.map((n) => n % 10_000_000 + 1), { minLength: 2, maxLength: 8 }), (items) => {
      const amount = items.reduce((a, b) => a + b, 0);
      return !checkReading({ date: "2026-10-01", amount, description: "Shop", itemTotals: items }, "2026-11-03", String)
        .some((i) => i.flag === "items-mismatch");
    }), RUNS);
  });
  it("keep a real date and never invent one", () => {
    fc.assert(fc.property(isoDate, (d) => cleanDate(d) === d), RUNS);
    fc.assert(fc.property(fc.anything(), (v) => { const c = cleanDate(v); return c === "" || isRealDate(c); }), RUNS);
  });
});

describe("What left my phone", () => {
  const entry = fc.record({
    at: isoDate.map((d) => `${d}T12:00:00.000Z`),
    kind: fc.constantFrom<LeftEntry["kind"]>("receipt-ai", "question-ai", "backup", "export", "hmrc"),
    to: fc.string({ maxLength: 10 }),
    locked: fc.boolean(),
  });
  it("never grows past its limit, and always keeps the newest item", () => {
    fc.assert(fc.property(fc.array(entry, { maxLength: 50 }), entry, (log, e) => {
      const big = Array.from({ length: MAX_ENTRIES }, () => ({ ...e, at: "2099-01-01T00:00:00.000Z" }));
      const next = addEntry([...big, ...log], e, new Date("2099-06-01T00:00:00Z"));
      return next.length <= MAX_ENTRIES && next[next.length - 1] === e;
    }), { numRuns: 50 });
  });
  it("reading a damaged record never crashes", () => {
    fc.assert(fc.property(fc.oneof(fc.string(), fc.json()), (raw) => Array.isArray(parseLog(raw))), RUNS);
  });
});
