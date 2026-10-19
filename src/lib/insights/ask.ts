/**
 * ask — "Ask your books", without AI.
 *
 * The user picks what (spent / earned), on what (a category or everything)
 * and when (a period), and LedgerJack works out the answer from their own
 * entries on the device.
 *
 * Design note for a later AI layer: the AI must never see the entries or do
 * the arithmetic. Its only job would be to turn a typed question into a
 * BooksQuery, using nothing but the question and the list of category names.
 * parseBooksQuery() is the gate: anything that isn't a valid query is refused,
 * so a question like "should I claim this?" can't produce tax advice; it
 * simply has no query to become. The answer is then computed here, as below.
 */

import { type Entry, addDays, fiscalYearWindow, lastDayOfMonth, monthOf, previousMonth } from "../bookscheck/entries";

export type Measure = "spent" | "earned";
export type PeriodKey = "this-month" | "last-month" | "last-3-months" | "this-year" | "last-year";

export interface BooksQuery {
  measure: Measure;
  /** A category name, or "all". */
  category: string;
  period: PeriodKey;
}

export interface BooksAnswer {
  query: BooksQuery;
  from: string;
  to: string;
  totalCents: number;
  count: number;
  /** Largest entries in the answer (up to 3), for "where did that come from?". */
  largest: { description: string; date: string; amountCents: number }[];
  /** Entries still in review that would match, so the user knows the total excludes them. */
  pendingCount: number;
}

export const PERIODS: PeriodKey[] = ["this-month", "last-month", "last-3-months", "this-year", "last-year"];

/**
 * Date range for a period. "this-year" runs from the start of the current tax
 * (or financial) year to today; "last-year" is the whole previous one.
 */
export function resolvePeriod(
  period: PeriodKey,
  today: string,
  fy: { month: number; day: number },
): { from: string; to: string } {
  const thisMonth = monthOf(today);
  switch (period) {
    case "this-month":
      return { from: `${thisMonth}-01`, to: today };
    case "last-month": {
      const m = previousMonth(thisMonth);
      return { from: `${m}-01`, to: lastDayOfMonth(m) };
    }
    case "last-3-months": {
      const end = previousMonth(thisMonth);
      const start = previousMonth(previousMonth(end));
      return { from: `${start}-01`, to: lastDayOfMonth(end) };
    }
    case "this-year": {
      const w = fiscalYearWindow(fy.month, fy.day, today);
      return { from: w.from, to: today };
    }
    case "last-year": {
      const w = fiscalYearWindow(fy.month, fy.day, today);
      const prev = fiscalYearWindow(fy.month, fy.day, addDays(w.from, -1));
      return prev;
    }
  }
}

/** Category names the user actually has, for the picker (and for any future AI layer). */
export function categoriesFor(entries: Entry[], measure: Measure): string[] {
  const kind = measure === "earned" ? "income" : "expense";
  return [...new Set(entries.filter((e) => e.kind === kind).map((e) => e.category))].sort((a, b) => a.localeCompare(b));
}

/**
 * Validate an untrusted query (for example, one proposed by an AI). Returns a
 * clean BooksQuery, or null if anything is off. Never throws.
 */
export function parseBooksQuery(input: unknown, knownCategories: string[]): BooksQuery | null {
  if (!input || typeof input !== "object") return null;
  const q = input as Record<string, unknown>;
  if (q.measure !== "spent" && q.measure !== "earned") return null;
  if (typeof q.period !== "string" || !(PERIODS as string[]).includes(q.period)) return null;
  if (typeof q.category !== "string") return null;
  const category = q.category === "all" ? "all" : knownCategories.find((c) => c.toLowerCase() === (q.category as string).toLowerCase());
  if (!category) return null;
  return { measure: q.measure, category, period: q.period as PeriodKey };
}

export function answerQuery(
  entries: Entry[],
  query: BooksQuery,
  today: string,
  fy: { month: number; day: number },
): BooksAnswer {
  const { from, to } = resolvePeriod(query.period, today, fy);
  const kind = query.measure === "earned" ? "income" : "expense";
  const matches = (e: Entry) =>
    e.kind === kind && e.date >= from && e.date <= to && (query.category === "all" || e.category === query.category);

  const hits = entries.filter((e) => matches(e) && !e.pending);
  const pendingCount = entries.filter((e) => matches(e) && e.pending).length;
  const totalCents = hits.reduce((t, e) => t + e.amountCents, 0);
  const largest = [...hits]
    .sort((a, b) => b.amountCents - a.amountCents || a.date.localeCompare(b.date))
    .slice(0, 3)
    .map((e) => ({ description: e.description, date: e.date, amountCents: e.amountCents }));

  return { query, from, to, totalCents, count: hits.length, largest, pendingCount };
}

const PERIOD_WORDS: Record<PeriodKey, (yearWord: string) => string> = {
  "this-month": () => "this month so far",
  "last-month": () => "last month",
  "last-3-months": () => "in the last 3 complete months",
  "this-year": (y) => `this ${y} so far`,
  "last-year": (y) => `last ${y}`,
};

export function periodLabel(period: PeriodKey, yearWord: string): string {
  return PERIOD_WORDS[period](yearWord);
}

/** The answer as one plain sentence. */
export function describeAnswer(a: BooksAnswer, money: (cents: number) => string, yearWord: string): string {
  const verb = a.query.measure === "earned" ? "earned" : "spent";
  const what = a.query.category === "all"
    ? (a.query.measure === "earned" ? "" : " in total")
    : a.query.measure === "earned" ? ` from ${a.query.category}` : ` on ${a.query.category}`;
  const when = periodLabel(a.query.period, yearWord);
  if (a.count === 0) {
    return `Nothing ${verb}${what} ${when} (${a.from} to ${a.to}).`;
  }
  return `You ${verb} ${money(a.totalCents)}${what} ${when} (${a.from} to ${a.to}), across ${a.count} entr${a.count === 1 ? "y" : "ies"}.`;
}
