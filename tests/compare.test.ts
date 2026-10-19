import { describe, it, expect } from "vitest";
import type { Entry } from "../src/lib/bookscheck/entries";
import { compareLastTwoMonths, describeChange, describeDrivers, monthName } from "../src/lib/insights/compare";

let n = 0;
const e = (over: Partial<Entry>): Entry => ({
  id: `c${++n}`, date: "2026-09-10", description: "Item", kind: "expense", category: "Travel",
  amountCents: 1000, hasReceipt: true, isMileage: false, pending: false, ...over,
});
const money = (c: number) => `£${(c / 100).toFixed(2)}`;

describe("compareLastTwoMonths", () => {
  it("compares the last two complete months, not the current one", () => {
    const cmp = compareLastTwoMonths([
      e({ date: "2026-10-05", amountCents: 99999 }), // current month: ignored
      e({ date: "2026-09-10", amountCents: 24500 }),
      e({ date: "2026-08-10", amountCents: 18500 }),
    ], "2026-10-19");
    expect(cmp.month).toBe("2026-09");
    expect(cmp.previous).toBe("2026-08");
    expect(cmp.expenses).toEqual({ thisCents: 24500, lastCents: 18500 });
    expect(cmp.changes).toHaveLength(1);
    expect(cmp.changes[0].deltaCents).toBe(6000);
  });

  it("handles January (previous month in the year before)", () => {
    const cmp = compareLastTwoMonths([], "2027-02-03");
    expect([cmp.month, cmp.previous]).toEqual(["2027-01", "2026-12"]);
    expect(cmp.hasData).toBe(false);
  });

  it("ignores small or proportionally tiny movements", () => {
    const cmp = compareLastTwoMonths([
      e({ date: "2026-09-10", amountCents: 1500, category: "Parking" }),
      e({ date: "2026-08-10", amountCents: 1000, category: "Parking" }), // +£5: too small
      e({ date: "2026-09-10", amountCents: 210000, category: "Rent" }),
      e({ date: "2026-08-10", amountCents: 200000, category: "Rent" }), // +£100 but 5%: too small
    ], "2026-10-19");
    expect(cmp.changes).toHaveLength(0);
  });

  it("leaves out pending entries and transfers", () => {
    const cmp = compareLastTwoMonths([
      e({ date: "2026-09-10", amountCents: 50000, pending: true }),
      e({ date: "2026-09-10", amountCents: 50000, kind: "other" }),
    ], "2026-10-19");
    expect(cmp.hasData).toBe(false);
  });

  it("orders by size of movement and names the biggest entries", () => {
    const cmp = compareLastTwoMonths([
      e({ date: "2026-09-02", amountCents: 4500, description: "Shell fuel" }),
      e({ date: "2026-09-12", amountCents: 4400, description: "Shell fuel" }),
      e({ date: "2026-09-20", amountCents: 1000, description: "Parking" }),
      e({ date: "2026-08-10", amountCents: 3000, description: "Shell fuel" }),
      e({ date: "2026-09-10", kind: "income", category: "Sales", amountCents: 100000 }),
      e({ date: "2026-08-10", kind: "income", category: "Sales", amountCents: 150000 }),
    ], "2026-10-19");
    expect(cmp.changes.map((c) => c.category)).toEqual(["Sales", "Travel"]);
    const travel = cmp.changes[1];
    expect(describeChange(travel, cmp, money)).toBe("Travel: £99.00 in September, up £69.00 on August.");
    expect(describeDrivers(travel, money)).toBe("Largest: Shell fuel £45.00, Shell fuel £44.00, Parking £10.00.");
    expect(describeChange(cmp.changes[0], cmp, money)).toBe("Sales: £1000.00 in September, down £500.00 on August.");
    expect(describeDrivers(cmp.changes[0], money)).toBe("");
  });

  it("words a new or stopped category plainly", () => {
    const cmp = compareLastTwoMonths([
      e({ date: "2026-09-10", amountCents: 3000, category: "Tools" }),
      e({ date: "2026-08-10", amountCents: 2500, category: "Phone" }),
    ], "2026-10-19");
    const tools = cmp.changes.find((c) => c.category === "Tools")!;
    const phone = cmp.changes.find((c) => c.category === "Phone")!;
    expect(describeChange(tools, cmp, money)).toBe("£30.00 spent on Tools in September, with nothing in August.");
    expect(describeChange(phone, cmp, money)).toBe("Nothing spent on Phone in September, against £25.00 in August.");
  });

  it("names months", () => {
    expect(monthName("2026-01")).toBe("January");
    expect(monthName("2026-12")).toBe("December");
  });
});
