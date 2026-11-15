/**
 * mtdApi — the MTD operations the screens call. Each wraps callHmrc() (which
 * handles tokens, refresh and fraud headers) with the right endpoint + version.
 *
 * Pass `govTestScenario` while in sandbox to exercise HMRC's test cases.
 */

import { recordLeft } from "../privacy/store";
import { callHmrc } from "./hmrcClient";
import { endpoints, ACCEPT, taxYearFor, type CalculationType } from "./mtdEndpoints";
import { buildCumulativeBody, checkCumulativeBody } from "./cumulativeUpdate";
import { loadNino } from "./mtdVault";
import type { PeriodSummary } from "./mtdAggregator";

async function nino(): Promise<string> {
  const n = await loadNino();
  if (!n) throw new Error("nino_missing");
  return n;
}

export interface BusinessInfo {
  businessId: string;
  typeOfBusiness?: string;
  tradingName?: string;
}

/** List businesses and return the first self-employment one (with its id). */
export async function getSelfEmploymentBusiness(scenario?: string): Promise<BusinessInfo | null> {
  const n = await nino();
  const res = await callHmrc({
    method: "GET",
    path: endpoints.listBusinesses(n),
    acceptVersion: ACCEPT.businessDetails,
    govTestScenario: scenario,
  });
  if (res.status >= 400) throw new Error(`business_list_${res.status}`);
  // business-details-api v2: { listOfBusinesses: [{ typeOfBusiness, businessId, tradingName }] }
  const data = res.data as any;
  const list: any[] = Array.isArray(data?.listOfBusinesses) ? data.listOfBusinesses : [];
  // Only a self-employment business: never fall back to a property business.
  const se = list.find((b) => b?.typeOfBusiness === "self-employment");
  if (!se || typeof se.businessId !== "string") return null;
  return { businessId: se.businessId, typeOfBusiness: se.typeOfBusiness, tradingName: se.tradingName };
}

export interface Obligation {
  periodStartDate: string;
  periodEndDate: string;
  dueDate: string;
  status: "Open" | "Fulfilled" | string;
}

export async function getObligations(fromDate: string, toDate: string, scenario?: string, businessId?: string): Promise<Obligation[]> {
  const n = await nino();
  const res = await callHmrc({
    method: "GET",
    path: endpoints.obligations(n, fromDate, toDate, businessId),
    acceptVersion: ACCEPT.obligations,
    govTestScenario: scenario,
  });
  if (res.status >= 400) throw new Error(`obligations_${res.status}`);
  const data = res.data as any;
  // Flatten the documented { obligations: [{ obligationDetails: [...] }] } shape.
  const rows: Obligation[] = [];
  const groups: any[] = data?.obligations ?? [];
  for (const g of groups) {
    for (const d of (g.obligationDetails ?? g.details ?? [])) {
      rows.push({
        periodStartDate: d.periodStartDate ?? d.inboundCorrespondenceFromDate,
        periodEndDate: d.periodEndDate ?? d.inboundCorrespondenceToDate,
        dueDate: d.dueDate ?? d.inboundCorrespondenceDueDate,
        // v3 returns "open" or "fulfilled".
        status: d.status === "fulfilled" ? "Fulfilled" : "Open",
      });
    }
  }
  return rows;
}

/** Submit a quarterly update. Updates are cumulative: `summary` must cover the
 *  start of the tax year to the end of the update period (see cumulativeStart).
 *  `consolidated` swaps itemised expenses for one figure (allowed under the
 *  turnover threshold). Throws before sending if HMRC would reject the body. */
export async function submitQuarterlyUpdate(
  businessId: string,
  summary: PeriodSummary,
  opts: { consolidated?: boolean; scenario?: string } = {},
): Promise<{ status: number; data: unknown }> {
  const n = await nino();
  const taxYear = taxYearFor(summary.periodDates.periodEndDate);

  const body = buildCumulativeBody(summary, !!opts.consolidated);
  const problems = checkCumulativeBody(body);
  if (problems.length) throw new Error("update_invalid: " + problems.join(" "));

  const res = await callHmrc({
    method: "PUT",
    path: endpoints.submitCumulative(n, businessId, taxYear),
    acceptVersion: ACCEPT.selfEmployment,
    body,
    govTestScenario: opts.scenario,
  });
  if (res.status >= 200 && res.status < 300) void recordLeft("hmrc", "HMRC (through the LedgerJack HMRC relay)", false);
  return res;
}

/** Ask HMRC to start a calculation. "in-year" for an estimate; "intent-to-finalise"
 *  before the final declaration. Returns HMRC's calculationId. */
export async function triggerCalculation(taxYear: string, type: CalculationType, scenario?: string) {
  const n = await nino();
  return callHmrc({
    method: "POST",
    path: endpoints.triggerCalculation(n, taxYear, type),
    acceptVersion: ACCEPT.calculations,
    govTestScenario: scenario,
  });
}

export async function getCalculation(taxYear: string, calculationId: string, scenario?: string) {
  const n = await nino();
  return callHmrc({
    method: "GET",
    path: endpoints.getCalculation(n, taxYear, calculationId),
    acceptVersion: ACCEPT.calculations,
    govTestScenario: scenario,
  });
}

/** HMRC returns 404 until a triggered calculation is ready, so wait and retry. */
export async function waitForCalculation(
  taxYear: string,
  calculationId: string,
  opts: { scenario?: string; tries?: number; delayMs?: number } = {},
) {
  const tries = opts.tries ?? 8;
  const delay = opts.delayMs ?? 2000;
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, i === 0 ? delay / 2 : delay));
    const res = await getCalculation(taxYear, calculationId, opts.scenario);
    if (res.status !== 404) return res;
  }
  throw new Error("calc_not_ready");
}

/** Submit the final declaration for exactly the calculation the person saw and
 *  agreed to (it must have been triggered as "intent-to-finalise"). */
export async function submitFinalDeclaration(taxYear: string, calculationId: string, scenario?: string) {
  const n = await nino();
  const res = await callHmrc({
    method: "POST",
    path: endpoints.finalDeclaration(n, taxYear, calculationId),
    acceptVersion: ACCEPT.calculations,
    govTestScenario: scenario,
  });
  if (res.status >= 200 && res.status < 300) void recordLeft("hmrc", "HMRC (through the LedgerJack HMRC relay)", false);
  return res;
}
