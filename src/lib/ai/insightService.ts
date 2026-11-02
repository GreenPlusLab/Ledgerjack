/**
 * insightService — asks an ANTHROPIC model (via OpenRouter) to EXPLAIN the
 * numbers we computed, in plain English. It never computes or invents figures.
 *
 * DISCIPLINE:
 *  - On-screen figures are LedgerJack's own computed numbers (authoritative).
 *  - The AI is forbidden to invent, calculate, estimate or extrapolate any
 *    figure; it must copy figures exactly from the data. Temperature 0.
 *  - Education only, jurisdiction-aware framing, light on tax rules.
 */

import { INSIGHTS_DEFAULT, getModel } from "./aiModels";
import { callAI } from "./gateway";
import type { FinancialMetrics } from "../insights/metrics";
import { TAX_REGIONS, type TaxRegion } from "../regions";

function taxTerm(region: TaxRegion): string {
  if (region === "uk" || region === "ie") return "VAT";
  if (region === "au" || region === "nz" || region === "ca") return "GST";
  if (region === "us") return "sales tax";
  return "VAT/GST/sales tax";
}

const SYSTEM_PROMPT = `You explain a self-employed person's OWN bookkeeping numbers to them in plain, friendly English. The reader is not an accountant.

ABSOLUTE RULES ABOUT NUMBERS — follow exactly:
- Use ONLY the figures given in the DATA block. Those are the authoritative numbers from the user's accounting records.
- NEVER invent, calculate, estimate, extrapolate, round differently, or produce any number that is not present verbatim in the DATA. If you state a figure, copy it exactly as given.
- NEVER invent clients, categories, transactions, dates or events not present in the DATA.
- If something the reader might want isn't in the DATA, say it isn't available rather than guessing.
- Describe relationships using the percentages already provided; do not compute your own percentages.

STYLE AND SCOPE:
- Education only. This is NOT tax, accounting or financial advice. Do not tell the reader what they owe, can claim, or should do. Where useful, suggest they discuss a point with their accountant.
- Be light on tax rules and jurisdiction-specific specifics; focus on helping them UNDERSTAND their numbers.
- Frame everything in the user's currency and country as given.
- Plain English, no jargon. When you use a term like "margin", explain it in a few words.

Write four short sections with these headings exactly:
1. Where your money went
2. How the business is doing
3. Your cash flow
4. Things to look into
Keep it concise. End section 4 with a gentle reminder to take anything important to their accountant.`;

export async function generateInsight(
  metrics: FinancialMetrics,
  region: TaxRegion,
  apiKey: string,
  modelId: string = INSIGHTS_DEFAULT,
): Promise<string> {
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("Add your OpenRouter key in Settings to generate an explanation.");
  }
  const model = getModel(modelId);
  if (!model) throw new Error("Unknown model.");

  const cfg = TAX_REGIONS[region];
  const dataBlock = {
    country: cfg.label,
    currencySymbol: cfg.currencySymbol,
    taxTerm: taxTerm(region),
    period: { from: metrics.from, to: metrics.to },
    income: metrics.income,
    expenses: metrics.expenses,
    netProfit: metrics.net,
    netMarginPercent: metrics.netMarginPct,
    expenseRatioPercent: metrics.expenseRatioPct,
    topExpenseCategories: metrics.topExpenses,
    topIncomeSources: metrics.topIncome,
    incomeConcentrationPercent: metrics.incomeConcentrationPct,
    approvedTransactions: metrics.transactionCount,
    stillAwaitingReview: metrics.pendingCount,
    lastSixMonths: metrics.monthly,
  };

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content:
        `Explain these numbers for the reader. Remember: use ONLY these figures, never invent any.\n\nDATA:\n` +
        JSON.stringify(dataBlock, null, 2),
    },
  ];

  const or = await callAI({ purpose: "question", model: model.id, messages, apiKey, maxTokens: 900, temperature: 0 });

  return or.content.trim() || "No explanation was returned.";
}

/** Build the same authoritative data block used for explanations. */
function dataBlockFor(metrics: FinancialMetrics, region: TaxRegion) {
  const cfg = TAX_REGIONS[region];
  return {
    country: cfg.label,
    currencySymbol: cfg.currencySymbol,
    taxTerm: taxTerm(region),
    period: { from: metrics.from, to: metrics.to },
    income: metrics.income,
    expenses: metrics.expenses,
    netProfit: metrics.net,
    netMarginPercent: metrics.netMarginPct,
    expenseRatioPercent: metrics.expenseRatioPct,
    topExpenseCategories: metrics.topExpenses,
    topIncomeSources: metrics.topIncome,
    incomeConcentrationPercent: metrics.incomeConcentrationPct,
    approvedTransactions: metrics.transactionCount,
    stillAwaitingReview: metrics.pendingCount,
    lastSixMonths: metrics.monthly,
  };
}

/** Answer a follow-up question about the numbers, under the same no-invention discipline. */
export async function askFollowUp(
  metrics: FinancialMetrics,
  region: TaxRegion,
  apiKey: string,
  modelId: string,
  question: string,
): Promise<string> {
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("Add your OpenRouter key in Settings to ask a question.");
  }
  const model = getModel(modelId);
  if (!model) throw new Error("Unknown model.");

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT + "\n\nThe reader may now ask a follow-up question. Answer it briefly using ONLY the DATA. If the answer isn't in the DATA, say so plainly rather than guessing." },
    { role: "user" as const, content: `DATA:\n${JSON.stringify(dataBlockFor(metrics, region), null, 2)}\n\nQUESTION: ${question}` },
  ];

  const or = await callAI({ purpose: "question", model: model.id, messages, apiKey, maxTokens: 600, temperature: 0 });
  return or.content.trim() || "No answer was returned.";
}
