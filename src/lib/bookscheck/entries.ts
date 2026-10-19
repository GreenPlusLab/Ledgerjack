/**
 * entries — a flat, read-only view of each transaction for the books check,
 * the plain comparisons and "Ask your books".
 *
 * Pure: no database access here, so every rule can be unit-tested. The loader
 * in ./load.ts reads the ledger through loadWithSplits and calls toEntries().
 *
 * Amounts stay in integer minor units (pence/cents) throughout.
 */

import type { DBAccountType, TransactionWithSplits } from "../db";

export type EntryKind = "income" | "expense" | "other";

export interface Entry {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  description: string;
  kind: EntryKind;
  /** Human category: the second segment of the account path ("Expenses:Travel:Fuel" -> "Travel"). */
  category: string;
  /** Positive magnitude in minor units of the income or expense side. 0 for "other". */
  amountCents: number;
  hasReceipt: boolean;
  isMileage: boolean;
  /** Still in the review queue, so not yet in the user's totals. */
  pending: boolean;
}

export function humanCategory(path: string): string {
  const parts = path.split(":");
  return parts[1] ?? parts[0] ?? "Other";
}

/** Same fallback the Insights metrics use when an account isn't in the chart. */
export function inferAccountType(path: string): DBAccountType | undefined {
  if (/^income[:/]/i.test(path)) return "INCOME";
  if (/^expenses?[:/]/i.test(path)) return "EXPENSE";
  return undefined;
}

/**
 * Turn ledger transactions (already decrypted by loadWithSplits) into entries.
 * A transaction counts as income when its income side is positive and at least
 * as large as any expense side; otherwise as an expense when the expense side
 * is positive; anything else (transfers, refunds, owner drawings) is "other".
 */
export function toEntries(
  txns: TransactionWithSplits[],
  accountTypes: Map<string, DBAccountType>,
  mileageTxIds: Set<string>,
): Entry[] {
  return txns.map((tx) => {
    let income = 0;
    let expense = 0;
    let incomeTop = { cents: 0, category: "" };
    let expenseTop = { cents: 0, category: "" };

    for (const s of tx.splits) {
      const type = accountTypes.get(s.account_id) ?? inferAccountType(s.account_id);
      if (type === "INCOME") {
        const v = -s.amount;
        income += v;
        if (v > incomeTop.cents) incomeTop = { cents: v, category: humanCategory(s.account_id) };
      } else if (type === "EXPENSE") {
        const v = s.amount;
        expense += v;
        if (v > expenseTop.cents) expenseTop = { cents: v, category: humanCategory(s.account_id) };
      }
    }

    let kind: EntryKind = "other";
    let amountCents = 0;
    let category = "Other";
    if (income > 0 && income >= expense) {
      kind = "income";
      amountCents = income;
      category = incomeTop.category || "Income";
    } else if (expense > 0) {
      kind = "expense";
      amountCents = expense;
      category = expenseTop.category || "Expenses";
    }

    return {
      id: tx.id,
      date: tx.date,
      description: tx.description ?? "",
      kind,
      category,
      amountCents,
      hasReceipt: !!tx.attachment_id,
      isMileage: mileageTxIds.has(tx.id),
      pending: !!tx.pending_review,
    };
  });
}

// ── Date helpers (UTC, on YYYY-MM-DD strings) ────────────────────────────────

export function daysBetween(a: string, b: string): number {
  const ms = Math.abs(Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z"));
  return Math.round(ms / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM of a date string. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** Every YYYY-MM from `from` to `to` inclusive. */
export function monthsBetween(fromMonth: string, toMonth: string): string[] {
  const out: string[] = [];
  let [y, m] = fromMonth.split("-").map(Number);
  const [ty, tm] = toMonth.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

/** The month before a YYYY-MM. */
export function previousMonth(month: string): string {
  let [y, m] = month.split("-").map(Number);
  m--;
  if (m < 1) { m = 12; y--; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Last day of a YYYY-MM, as YYYY-MM-DD. */
export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * The fiscal (tax) year containing `today`, from the region's start month/day.
 * UK: 6 April to 5 April.
 */
export function fiscalYearWindow(
  startMonth: number,
  startDay: number,
  today: string,
): { from: string; to: string } {
  const [y] = today.split("-").map(Number);
  const startThisYear = `${y}-${String(startMonth).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`;
  const startYear = today >= startThisYear ? y : y - 1;
  const from = `${startYear}-${String(startMonth).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`;
  const nextStart = `${startYear + 1}-${String(startMonth).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`;
  return { from, to: addDays(nextStart, -1) };
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "September" for "2026-09". */
export function monthName(month: string): string {
  return MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month;
}

/** Today's date on the user's own clock, as YYYY-MM-DD. */
export function localToday(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
