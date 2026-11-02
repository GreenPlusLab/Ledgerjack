import { describe, it, expect } from "vitest";
import { dateFrom, dateOrderFor, suggestFromReceiptText, toMinor } from "../src/lib/ocr/receiptText";

const today = "2026-11-02";

describe("reading a receipt's text on the phone", () => {
  it("finds the shop, date, total and VAT on a typical UK receipt", () => {
    const text = `TESCO STORES 3104
Tel 0345 677 9000
23/09/2026 14:02
BIN BAGS 4.50
CLEANING SPRAY 25.45
SUBTOTAL 29.95
VAT 20% 4.99
TOTAL £29.95
VISA £29.95
CHANGE 0.00`;
    const s = suggestFromReceiptText(text, "DMY", today);
    expect(s).toMatchObject({ merchant: "TESCO STORES 3104", date: "2026-09-23", totalMinor: 2995, vatMinor: 499 });
    expect(s.notes).toEqual([]);
  });
  it("prefers 'amount due' over a plain total, and ignores subtotals and item counts", () => {
    const s = suggestFromReceiptText("Shop\nSubtotal 10.00\nTotal items 3\nAmount due 12.00\n", "DMY", today);
    expect(s.totalMinor).toBe(1200);
  });
  it("takes the amount from the next line when the total line has none", () => {
    expect(suggestFromReceiptText("Shop\nTOTAL\n£8.20\n", "DMY", today).totalMinor).toBe(820);
  });
  it("never guesses a total when there is no total line, or two different ones", () => {
    const none = suggestFromReceiptText("Shop\nMilk 1.20\nBread 2.10\n", "DMY", today);
    expect(none.totalMinor).toBeUndefined();
    expect(none.notes.join(" ")).toMatch(/No total line/);
    const two = suggestFromReceiptText("Shop\nTotal 5.00\nTotal 7.00\n", "DMY", today);
    expect(two.totalMinor).toBeUndefined();
    expect(two.notes.join(" ")).toMatch(/more than one total/);
  });
  it("doesn't mistake 'TOTAL inc VAT' or a VAT number for the VAT amount", () => {
    const s = suggestFromReceiptText("Shop\nVAT No 123 4567 89\nTOTAL 12.00 inc VAT\n", "DMY", today);
    expect(s.totalMinor).toBe(1200);
    expect(s.vatMinor).toBeUndefined();
  });
  it("drops a VAT figure bigger than the total", () => {
    const s = suggestFromReceiptText("Shop\nVAT 50.00\nTotal 12.00\n", "DMY", today);
    expect(s.vatMinor).toBeUndefined();
    expect(s.notes.join(" ")).toMatch(/VAT read as more than the total/);
  });
  it("flags a date in the future", () => {
    expect(suggestFromReceiptText("Shop\n23/09/2027\nTotal 1.00\n", "DMY", today).notes.join(" ")).toMatch(/after today/);
  });
  it("handles thousands separators and refuses odd amounts", () => {
    expect(toMinor("£1,234.56")).toBe(123456);
    expect(toMinor("12.3")).toBeNull();
  });
});

describe("receipt dates", () => {
  it("reads year-first, written months and two-digit years", () => {
    expect(dateFrom("2026-09-23", "DMY").date).toBe("2026-09-23");
    expect(dateFrom("23 Sep 2026", "DMY").date).toBe("2026-09-23");
    expect(dateFrom("Sept 23, 2026", "MDY").date).toBe("2026-09-23");
    expect(dateFrom("23/09/26", "DMY").date).toBe("2026-09-23");
  });
  it("uses the region's order for dates that fit both ways, and says so", () => {
    const uk = dateFrom("03/09/2026", "DMY");
    expect(uk.date).toBe("2026-09-03");
    expect(uk.note).toMatch(/two ways/);
    expect(dateFrom("03/09/2026", "MDY").date).toBe("2026-03-09");
  });
  it("reads a date that only fits one way without a warning", () => {
    expect(dateFrom("25/09/2026", "MDY")).toEqual({ date: "2026-09-25" });
  });
  it("says when there's no date", () => {
    expect(dateFrom("no date here", "DMY").date).toBeUndefined();
  });
  it("uses month-first only for the United States", () => {
    expect(dateOrderFor("us")).toBe("MDY");
    expect(dateOrderFor("uk")).toBe("DMY");
  });
});
