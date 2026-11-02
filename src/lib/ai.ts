import { makeSimpleSplits } from './ledger';
import type { DBTransaction, DBSplit } from './db';
import { TAX_REGIONS, type TaxRegion } from './regions';
import { parseCurrencyInput } from './currency';
import { callAI } from './ai/gateway';
import { checkReading, cleanDate, flagsOf, type ReadingIssue } from './ai/readingChecks';

export interface AIParserRequest {
  text?: string;
  imageData?: string;
  apiKey?: string;
  region: TaxRegion;
  /** When true, use gpt-4o for complex/image requests; otherwise gpt-4o-mini */
  useHighQualityModel?: boolean;
  modelId?: string;
  /** The person tapped "Read just this one with AI" (privacy choice is otherwise off). */
  justThisOne?: boolean;
}

export interface LineItem {
  description: string;
  quantity?: number;
  unit_price?: number;
  total: number;
  account?: string;
}

export interface AIParsedTransaction {
  description: string;
  date: string;
  amount: number;
  debit_account: string;
  credit_account: string;
  job_tag?: string;
  /**
   * The model's own confidence, 0–1, in the AMOUNT it read and the CATEGORY it
   * chose. Used to decide whether to wave the entry through or stop and ask.
   * Borrowed from the Andon idea: don't fail silently — raise a flag when unsure.
   * Absent means "the model didn't say", which we treat as unsure.
   */
  amount_confidence?: number;
  category_confidence?: number;
  /** Short, plain-English note on anything the model struggled to read. */
  uncertain_about?: string;
  line_items?: LineItem[];
  split_suggestion?: Array<{
    description: string;
    amount: number;
    debit_account: string;
    credit_account: string;
    job_tag?: string;
  }>;
}

/** Below this, we stop and ask the user rather than presenting a figure as fact. */
export const CONFIDENCE_THRESHOLD = 0.8;

/** Confidence when the model didn't give one — unknown is treated as unsure. */
export function confidenceOf(v: number | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

/** True when anything about this parse warrants a second look from a human. */
export function needsReview(p: AIParsedTransaction): boolean {
  return (
    confidenceOf(p.amount_confidence) < CONFIDENCE_THRESHOLD ||
    confidenceOf(p.category_confidence) < CONFIDENCE_THRESHOLD
  );
}

const ENHANCED_SYSTEM_PROMPT = `You are an expert pre-accounting parser for self-employed tradespeople and small business owners.

Your job is to parse receipts, invoices, handwritten notes, and bank statement entries into precise double-entry ledger records.

## Handling Complex Receipts

**Mixed Personal/Business Purchases:**
If the receipt contains BOTH business and personal items (e.g., "3x paint brushes (business)" and "1x chocolate bar"), produce a "split_suggestion" array with separate entries — one for the business portion and one for the personal/owner draw portion. Each entry in split_suggestion has: description, amount (decimal), debit_account, credit_account, optional job_tag.

**Line-Item Breakdown:**
For job costing, extract individual line items. Return a "line_items" array with: description, quantity (if present), unit_price (if present), total (decimal), account (best matching account path).

**Handwritten & Low-Quality Sources:**
When parsing what appears to be a handwritten invoice, crumpled receipt, or photographed note: be tolerant of spelling variants, abbreviations, crossed-out text, and unclear formatting. Read the merchant, date and amount as written. If one of them can't be read, use null for it and say so in "uncertain_about". Never guess.

## Output Schema

Return ONLY valid JSON — no markdown, no explanation:
{
  "description": "merchant or event title",
  "date": "YYYY-MM-DD",
  "amount": number (decimal total, always positive),
  "debit_account": "full account path",
  "credit_account": "full account path",
  "job_tag": "string or null",
  "amount_confidence": number between 0 and 1,
  "category_confidence": number between 0 and 1,
  "uncertain_about": "short plain-English note, or null",
  "line_items": [
    { "description": "item name", "quantity": 2, "unit_price": 5.00, "total": 10.00, "account": "account path" }
  ],
  "split_suggestion": [
    { "description": "business portion", "amount": 15.00, "debit_account": "...", "credit_account": "...", "job_tag": null },
    { "description": "personal draw", "amount": 5.00, "debit_account": "Equity:Owner's Draw", "credit_account": "Assets:Cash", "job_tag": null }
  ]
}

Omit "line_items" if there is only a single total. Omit "split_suggestion" if everything is clearly one type.

## Confidence — be honest, not polite
"amount_confidence" is how sure you are that you read the TOTAL correctly.
"category_confidence" is how sure you are that the accounts you chose are right.
Report LOW confidence (below 0.8) whenever any of these are true — this is expected and useful, not a failure:
 - the image is blurred, cropped, faded, crumpled or partly unreadable
 - several candidate totals appear (subtotal, tax, total, change given, a tip)
 - the merchant is unclear, or could plausibly be personal rather than business
 - handwriting is ambiguous, or a digit could be misread (1/7, 3/8, 0/6)
 - the receipt is in a currency or format you're unsure about
A wrong number stated confidently is far worse than an honest "please check this" —
the person relies on these figures for their tax. Never inflate confidence to seem helpful.
Put whatever you struggled with in "uncertain_about" (e.g. "total could be 12.50 or 12.60 — digit unclear").

## Account Hierarchy
- Assets:Cash, Assets:Bank, Assets:Receivables (or Debtors for UK)
- Income:Turnover (UK) / Income:Gross Receipts (US) / Income:Revenue (other)
- Income:Other Income
- Expenses:Cost of Sales:Materials
- Expenses:Cost of Sales:Subcontractors
- Expenses:Travel:Parking, Expenses:Travel:Fuel, Expenses:Travel:Mileage, Expenses:Travel:Other
- Expenses:Office:Stationery, Expenses:Office:Phone & Internet, Expenses:Office:Rent
- Expenses:Software & IT
- Expenses:Professional Fees
- Expenses:Insurance
- Expenses:Utilities
- Equity:Owner's Capital, Equity:Owner's Draw

## Rules
- Expenses: debit the expense account, credit Assets:Cash
- Income: debit Assets:Cash, credit the income account
- Amount always positive decimal
- If the date is not printed or can't be read, use null for "date". Never guess a date and never use today's date instead
- If a job name, site, or client is clearly mentioned, extract it as job_tag`;

function getRegionPrompt(region: TaxRegion): string {
  const cfg = TAX_REGIONS[region];
  return `\nRegion: ${cfg.label}. Currency: ${cfg.currencyCode} (${cfg.currencySymbol}). Primary income account: ${cfg.grossIncomeAccount}. Today's date: ${new Date().toISOString().split('T')[0]}.`;
}

/**
 * Select model based on complexity signals:
 * - Image attached → gpt-4o (vision required)
 * - Explicit high-quality request → gpt-4o
 * - Everything else → gpt-4o-mini (fast, cheap)
 */
function selectModel(request: AIParserRequest): string {
  // An explicit user-chosen scanning model wins (all listed scanning models
  // support vision, so it's safe even with an image).
  if (request.modelId) return request.modelId;
  if (request.imageData) return 'openai/gpt-4o';
  if (request.useHighQualityModel) return 'openai/gpt-4o';
  return 'openai/gpt-4o-mini';
}

export async function parseWithAI(
  request: AIParserRequest,
): Promise<AIParsedTransaction> {
  const { text, apiKey, region } = request;

  const cfg   = TAX_REGIONS[region];
  const model = selectModel(request);

  const systemContent = ENHANCED_SYSTEM_PROMPT + getRegionPrompt(region);
  const userContent   = text || 'Parse the attached receipt image.';

  const messages = [
    { role: 'system' as const, content: systemContent },
    {
      role: 'user' as const,
      content: request.imageData
        ? [
            { type: 'text', text: userContent },
            { type: 'image_url', image_url: { url: request.imageData, detail: 'high' } },
          ]
        : userContent,
    },
  ];

  // The gateway applies the privacy choice, monthly limit, free-model choice,
  // usage tracking and the "What left my phone" record.
  const or = await callAI({
    purpose: 'receipt',
    model,
    messages,
    apiKey: apiKey ?? '',
    maxTokens: model === 'openai/gpt-4o' ? 1500 : 800,
    temperature: 0,
    justThisOne: request.justThisOne,
    hasImage: !!request.imageData,
  });

  const content = or.content || '';

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI returned invalid response. Please enter manually.');

  let parsed: any;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('AI returned an unreadable response. Please try again or enter manually.');
  }
  const amount = parseCurrencyInput(String(parsed.amount));

  return {
    description:    typeof parsed.description === 'string' ? parsed.description.trim() : '',
    // A missing or unreadable date stays empty and is flagged; never today's date.
    date:           cleanDate(parsed.date),
    amount,
    amount_confidence:   typeof parsed.amount_confidence === 'number' ? parsed.amount_confidence : undefined,
    category_confidence: typeof parsed.category_confidence === 'number' ? parsed.category_confidence : undefined,
    uncertain_about:     typeof parsed.uncertain_about === 'string' && parsed.uncertain_about.trim() ? parsed.uncertain_about.trim() : undefined,
    debit_account:  parsed.debit_account  || cfg.allowableExpensesParent,
    credit_account: parsed.credit_account || cfg.cashAccount,
    job_tag:        parsed.job_tag || undefined,
    line_items:     parsed.line_items,
    split_suggestion: parsed.split_suggestion?.map((s: Record<string, unknown>) => ({
      ...s,
      amount: parseCurrencyInput(String(s.amount)),
    })),
  };
}

const today = () => new Date().toISOString().split('T')[0]!;

/**
 * What looks wrong with an AI reading, in plain words for the screen. `fmt`
 * turns pence into money text. Nothing is changed or blocked by this.
 */
export function checkAIReading(
  parsed: AIParsedTransaction,
  fmt: (minor: number) => string,
  todayIso: string = today(),
): ReadingIssue[] {
  return checkReading(
    {
      date: parsed.date,
      amount: parsed.amount,
      description: parsed.description,
      itemTotals: parsed.line_items?.map((i) => parseCurrencyInput(String(i.total))),
      splitAmounts: parsed.split_suggestion?.map((s) => s.amount),
      amountConfidence: parsed.amount_confidence,
      categoryConfidence: parsed.category_confidence,
    },
    todayIso,
    fmt,
  );
}

export function aiParsedToPendingTransaction(
  parsed: AIParsedTransaction,
  _region: TaxRegion,
): { txFields: Omit<DBTransaction, 'id' | 'last_modified' | 'is_locked'>; splits: Omit<DBSplit, 'id' | 'transaction_id'>[] } {
  const flags = flagsOf(checkAIReading(parsed, (m) => String(m)));
  return {
    txFields: {
      date:           parsed.date,
      description:    parsed.description || 'Receipt',
      pending_review: true,
      job_tag:        parsed.job_tag,
      attachment_id:  undefined,
      review_flags:   flags.length ? flags : undefined,
    },
    splits: makeSimpleSplits(parsed.debit_account, parsed.credit_account, parsed.amount),
  };
}
