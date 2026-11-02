/**
 * mtdApi — the MTD operations the screens call. Each wraps callHmrc() (which
 * handles tokens, refresh and fraud headers) with the right endpoint + version.
 *
 * Pass `govTestScenario` while in sandbox to exercise HMRC's test cases.
 */

import { recordLeft } from "../privacy/store";
import { callHmrc } from "./hmrcClient";
import { endpoints, ACCEPT, taxYearFor } from "./mtdEndpoints";
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
  // Shape varies by version; be defensive. CONFIRM the exact field names.
  const data = res.data as any;
  const list: any[] = data?.listOfBusinesses ?? data?.businesses ?? data?.businessData ?? [];
  const se = list.find((b) => /self-employment/i.test(b.typeOfBusiness ?? b.type ?? "")) ?? list[0];
  if (!se) return null;
  return {
    businessId: se.businessId ?? se.incomeSourceId ?? se.id,
    typeOfBusiness: se.typeOfBusiness ?? se.type,
    tradingName: se.tradingName ?? se.businessName,
  };
}

export interface Obligation {
  periodStartDate: string;
  periodEndDate: string;
  dueDate: string;
  status: "Open" | "Fulfilled" | string;
}

export async function getObligations(fromDate: string, toDate: string, scenario?: string): Promise<Obligation[]> {
  const n = await nino();
  const res = await callHmrc({
    method: "GET",
    path: endpoints.obligations(n, fromDate, toDate),
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
        status: d.status ?? "Open",
      });
    }
  }
  return rows;
}

/** Submit a quarterly period summary. `consolidated` swaps itemised expenses
 *  for a single figure (allowed under the turnover threshold). */
export async function submitQuarterlyUpdate(
  businessId: string,
  summary: PeriodSummary,
  opts: { consolidated?: boolean; scenario?: string } = {},
): Promise<{ status: number; data: unknown }> {
  const n = await nino();
  const taxYear = taxYearFor(summary.periodDates.periodEndDate);

  const body: Record<string, unknown> = {
    periodDates: summary.periodDates,
    periodIncome: summary.periodIncome,
    periodExpenses: opts.consolidated
      ? { consolidatedExpenses: summary.consolidatedExpenses }
      : summary.periodExpenses,
  };

  const res = await callHmrc({
    method: "POST",
    path: endpoints.submitPeriod(n, businessId, taxYear),
    acceptVersion: ACCEPT.selfEmployment,
    body,
    govTestScenario: opts.scenario,
  });
  if (res.status >= 200 && res.status < 300) void recordLeft("hmrc", "HMRC (through the LedgerJack HMRC relay)", false);
  return res;
}

export async function triggerCalculation(taxYear: string, scenario?: string) {
  const n = await nino();
  return callHmrc({
    method: "POST",
    path: endpoints.triggerCalculation(n, taxYear),
    acceptVersion: ACCEPT.calculations,
    govTestScenario: scenario,
  });
}

export async function getCalculation(calculationId: string, scenario?: string) {
  const n = await nino();
  return callHmrc({
    method: "GET",
    path: endpoints.getCalculation(n, calculationId),
    acceptVersion: ACCEPT.calculations,
    govTestScenario: scenario,
  });
}

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
