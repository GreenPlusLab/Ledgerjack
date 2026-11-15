/**
 * The body of a cumulative quarterly update (self-employment-business-api v5,
 * "Create or Amend a Self-Employment Cumulative Period Summary"), and the
 * checks HMRC applies, in plain words, so a person sees a problem before
 * anything is sent.
 *
 * HMRC's rules (checked 15 November 2026 against the API's own schema):
 *  - income and expenses must be sent even when they are zero;
 *  - income figures can't be negative;
 *  - send either itemised expenses or one consolidated figure, never both;
 *  - amounts have at most 2 decimal places and stay within ±99,999,999,999.99.
 */

import type { PeriodSummary } from "./mtdAggregator";

export interface CumulativeBody {
  periodDates: { periodStartDate: string; periodEndDate: string };
  periodIncome: Record<string, number>;
  periodExpenses: Record<string, number>;
}

const MAX = 99_999_999_999.99;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Build what HMRC receives. Never changes the figures, only fills in zeros. */
export function buildCumulativeBody(summary: Pick<PeriodSummary, "periodDates" | "periodIncome" | "periodExpenses" | "consolidatedExpenses">, consolidated: boolean): CumulativeBody {
  const periodIncome: Record<string, number> = { turnover: 0, other: 0 };
  for (const [k, v] of Object.entries(summary.periodIncome)) if (typeof v === "number") periodIncome[k] = round2(v);

  let periodExpenses: Record<string, number>;
  if (consolidated) {
    periodExpenses = { consolidatedExpenses: round2(summary.consolidatedExpenses ?? 0) };
  } else {
    periodExpenses = {};
    for (const [k, v] of Object.entries(summary.periodExpenses)) if (typeof v === "number") periodExpenses[k] = round2(v);
    // HMRC wants expenses even when there are none.
    if (Object.keys(periodExpenses).length === 0) periodExpenses.otherExpenses = 0;
  }
  return { periodDates: { ...summary.periodDates }, periodIncome, periodExpenses };
}

/**
 * Problems HMRC would reject, in plain words. An empty list means it's fine to
 * send. These block sending (HMRC would refuse it anyway); they never change
 * the person's figures.
 */
export function checkCumulativeBody(body: CumulativeBody): string[] {
  const out: string[] = [];
  const { periodStartDate, periodEndDate } = body.periodDates;
  const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
  if (!isDate(periodStartDate) || !isDate(periodEndDate)) out.push("The update period dates are missing or not valid.");
  else if (periodStartDate > periodEndDate) out.push("The update period starts after it ends.");

  const names: Record<string, string> = { turnover: "Turnover", other: "Other business income", taxTakenOffTradingIncome: "Tax taken off trading income" };
  for (const [k, v] of Object.entries(body.periodIncome)) {
    if (!Number.isFinite(v)) out.push(`${names[k] ?? k} isn't a valid amount.`);
    else if (v < 0) out.push(`${names[k] ?? k} for the year so far is below zero (${v.toFixed(2)}). HMRC doesn't accept negative income. Check for refunds or entries in the wrong category.`);
    else if (v > MAX) out.push(`${names[k] ?? k} is larger than HMRC accepts.`);
  }
  const expenseKeys = Object.keys(body.periodExpenses);
  if (expenseKeys.includes("consolidatedExpenses") && expenseKeys.length > 1) {
    out.push("Send either itemised expenses or one total, not both.");
  }
  for (const [k, v] of Object.entries(body.periodExpenses)) {
    if (!Number.isFinite(v) || Math.abs(v) > MAX) out.push(`The ${k} amount isn't one HMRC can accept.`);
  }
  return out;
}
