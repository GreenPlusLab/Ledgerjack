import { describe, it, expect } from "vitest";
import fc from "fast-check";
import schema from "./fixtures/hmrc/se-cumulative-request-v5.json";
import { ACCEPT, endpoints, cumulativeStart, taxYearFor } from "../src/lib/mtd/mtdEndpoints";
import { buildCumulativeBody, checkCumulativeBody } from "../src/lib/mtd/cumulativeUpdate";
import { HMRC_DECLARATION } from "../src/lib/mtd/declaration";
import { allowedHmrcCall, RateLimiter } from "../supabase/functions/hmrc-relay/guard";

const NINO = "AA123456A";
const BIZ = "XAIS12345678901";
const CALC = "f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c";

/** A small checker for HMRC's JSON schema (draft-04 subset HMRC uses here). */
function fitsSchema(value: any, s: any, path = ""): string[] {
  const errs: string[] = [];
  if (s.type === "object") {
    if (typeof value !== "object" || value === null) return [`${path} not an object`];
    for (const r of s.required ?? []) if (!(r in value)) errs.push(`${path}/${r} required`);
    for (const [k, v] of Object.entries(value)) {
      const sub = s.properties?.[k];
      if (!sub) { if (s.additionalProperties === false) errs.push(`${path}/${k} not allowed`); continue; }
      errs.push(...fitsSchema(v, sub, `${path}/${k}`));
    }
  } else if (s.type === "number") {
    if (typeof value !== "number") return [`${path} not a number`];
    if (s.minimum !== undefined && value < s.minimum) errs.push(`${path} below minimum`);
    if (s.maximum !== undefined && value > s.maximum) errs.push(`${path} above maximum`);
    if (s.multipleOf === 0.01 && Math.abs(Math.round(value * 100) - value * 100) > 1e-6) errs.push(`${path} more than 2 decimals`);
  } else if (s.type === "string") {
    if (typeof value !== "string") return [`${path} not a string`];
    if (s.format === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) errs.push(`${path} not a date`);
  }
  return errs;
}

describe("HMRC API versions (checked against HMRC's published source, 15 Nov 2026)", () => {
  it("uses versions HMRC still offers", () => {
    expect(ACCEPT).toEqual({
      businessDetails: "application/vnd.hmrc.2.0+json",
      obligations: "application/vnd.hmrc.3.0+json",
      selfEmployment: "application/vnd.hmrc.5.0+json",
      calculations: "application/vnd.hmrc.8.0+json",
    });
  });
});

describe("the app and the relay agree", () => {
  const calls: [string, string][] = [
    ["GET", endpoints.listBusinesses(NINO)],
    ["GET", endpoints.obligations(NINO, "2026-04-06", "2027-04-05", BIZ).split("?")[0]!],
    ["PUT", endpoints.submitCumulative(NINO, BIZ, "2026-27")],
    ["POST", endpoints.triggerCalculation(NINO, "2026-27", "in-year")],
    ["POST", endpoints.triggerCalculation(NINO, "2026-27", "intent-to-finalise")],
    ["GET", endpoints.getCalculation(NINO, "2026-27", CALC)],
    ["POST", endpoints.finalDeclaration(NINO, "2026-27", CALC)],
    ["GET", "/organisations/vat/123456789/obligations"],
    ["POST", "/organisations/vat/123456789/returns"],
  ];
  it("every call the app makes is one the relay forwards", () => {
    for (const [m, p] of calls) expect(allowedHmrcCall(m, p, false), `${m} ${p}`).toBe(true);
  });
  it("the relay refuses anything else", () => {
    expect(allowedHmrcCall("DELETE", endpoints.submitCumulative(NINO, BIZ, "2026-27"), false)).toBe(false);
    expect(allowedHmrcCall("GET", "/individuals/business/details/AA123456A/XAIS12345678901", false)).toBe(false);
    expect(allowedHmrcCall("GET", "/individuals/business/details/NOTANINO/list", false)).toBe(false);
    expect(allowedHmrcCall("POST", "/individuals/calculations/AA123456A/self-assessment/2026-27/trigger/anything", false)).toBe(false);
    expect(allowedHmrcCall("GET", "/organisations/vat/123/obligations", false)).toBe(false);
    expect(allowedHmrcCall("GET", "/anything/else", false)).toBe(false);
  });
  it("only allows HMRC's header checker in the sandbox", () => {
    expect(allowedHmrcCall("GET", "/test/fraud-prevention-headers/validate", true)).toBe(true);
    expect(allowedHmrcCall("GET", "/test/fraud-prevention-headers/validate", false)).toBe(false);
  });
  it("filters obligations to the one self-employment business", () => {
    expect(endpoints.obligations(NINO, "2026-04-06", "2027-04-05", BIZ)).toContain("typeOfBusiness=self-employment&businessId=XAIS12345678901");
  });
});

describe("quarterly updates cover the year so far", () => {
  const q = (s: string, e: string) => ({ periodStartDate: s, periodEndDate: e });
  it("start on 6 April for standard periods", () => {
    const year = [q("2026-04-06", "2026-07-05"), q("2026-07-06", "2026-10-05"), q("2026-10-06", "2027-01-05"), q("2027-01-06", "2027-04-05")];
    for (const o of year) expect(cumulativeStart(o, year)).toBe("2026-04-06");
    expect(cumulativeStart(q("2026-10-06", "2027-01-05"))).toBe("2026-04-06");
  });
  it("start on 1 April for calendar periods", () => {
    expect(cumulativeStart(q("2026-07-01", "2026-09-30"))).toBe("2026-04-01");
    expect(cumulativeStart(q("2027-01-01", "2027-03-31"), [q("2026-04-01", "2026-06-30")])).toBe("2026-04-01");
  });
  it("start when the business began, if that was part-way through the year", () => {
    const year = [q("2026-08-15", "2026-10-05"), q("2026-10-06", "2027-01-05")];
    expect(cumulativeStart(year[1]!, year)).toBe("2026-08-15");
    expect(cumulativeStart(q("2026-08-15", "2026-10-05"))).toBe("2026-08-15");
  });
  it("ignore another tax year's obligations", () => {
    expect(cumulativeStart(q("2026-07-06", "2026-10-05"), [q("2025-04-06", "2025-07-05")])).toBe("2026-04-06");
  });
  it("name the tax year from the end date", () => {
    expect(taxYearFor("2027-04-05")).toBe("2026-27");
    expect(taxYearFor("2027-03-31")).toBe("2026-27");
  });
});

describe("what is sent to HMRC", () => {
  const base = { periodDates: { periodStartDate: "2026-04-06", periodEndDate: "2026-10-05" }, consolidatedExpenses: 120.5 };
  it("always includes income and expenses, even when zero", () => {
    const b = buildCumulativeBody({ ...base, periodIncome: {}, periodExpenses: {} }, false);
    expect(b.periodIncome).toEqual({ turnover: 0, other: 0 });
    expect(b.periodExpenses).toEqual({ otherExpenses: 0 });
    expect(checkCumulativeBody(b)).toEqual([]);
  });
  it("sends one total or itemised expenses, never both", () => {
    const b = buildCumulativeBody({ ...base, periodIncome: { turnover: 1000 }, periodExpenses: { adminCosts: 20 } }, true);
    expect(b.periodExpenses).toEqual({ consolidatedExpenses: 120.5 });
    expect(checkCumulativeBody({ ...b, periodExpenses: { consolidatedExpenses: 1, adminCosts: 2 } })).toHaveLength(1);
  });
  it("stops negative income before it is sent, in plain words", () => {
    const b = buildCumulativeBody({ ...base, periodIncome: { turnover: -50 }, periodExpenses: {} }, false);
    expect(checkCumulativeBody(b)[0]).toMatch(/Turnover .* below zero/);
  });
  it("always fits HMRC's own schema", () => {
    const money = fc.integer({ min: 0, max: 10_000_000_000 }).map((p) => p / 100);
    const anyMoney = fc.integer({ min: -10_000_000_000, max: 10_000_000_000 }).map((p) => p / 100);
    const keys = ["costOfGoods", "paymentsToSubcontractors", "wagesAndStaffCosts", "carVanTravelExpenses", "premisesRunningCosts",
      "maintenanceCosts", "adminCosts", "businessEntertainmentCosts", "advertisingCosts", "interestOnBankOtherLoans", "financeCharges",
      "irrecoverableDebts", "professionalFees", "depreciation", "otherExpenses"] as const;
    fc.assert(fc.property(
      fc.record({ turnover: money, other: money }, { requiredKeys: [] }),
      fc.dictionary(fc.constantFrom(...keys), anyMoney),
      money, fc.boolean(),
      (inc, exp, cons, consolidated) => {
        const b = buildCumulativeBody({ ...base, consolidatedExpenses: cons, periodIncome: inc, periodExpenses: exp }, consolidated);
        expect(fitsSchema(b, schema)).toEqual([]);
        expect(checkCumulativeBody(b)).toEqual([]);
      }), { numRuns: 300 });
  });
});

describe("final declaration", () => {
  it("uses HMRC's wording exactly", () => {
    expect(HMRC_DECLARATION).toBe("I declare that the information and tax return I have submitted are (taken together) correct and complete to the best of my knowledge. I understand that I may have to pay financial penalties and face prosecution if I give false information.");
  });
});

describe("relay rate limit", () => {
  it("allows up to the limit per sender, then refuses until the window passes", () => {
    const r = new RateLimiter(3, 1000);
    expect([r.allow("a", 0), r.allow("a", 1), r.allow("a", 2), r.allow("a", 3)]).toEqual([true, true, true, false]);
    expect(r.allow("b", 3)).toBe(true);
    expect(r.allow("a", 1001)).toBe(true);
  });
});
