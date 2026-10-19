/**
 * compare — plain month-on-month comparisons, worked out on the device with no
 * AI. "Travel: £245.00 in September, up £60.00 on August, mainly 3 Shell
 * receipts." For users who don't switch AI on, and as solid ground for those
 * who do.
 *
 * Compares the last two COMPLETE months, so a half-finished month is never
 * held up against a full one. Approved entries only. Integer minor units.
 */

import { type Entry, monthOf, monthName, previousMonth } from "../bookscheck/entries";

export { monthName };

export interface CategoryChange {
  kind: "income" | "expense";
  category: string;
  thisCents: number;
  lastCents: number;
  /** thisCents - lastCents */
  deltaCents: number;
  /** Largest entries in the later month for this category (up to 3). */
  biggest: { description: string; date: string; amountCents: number }[];
}

export interface MonthComparison {
  /** The later complete month, YYYY-MM. */
  month: string;
  /** The month before it, YYYY-MM. */
  previous: string;
  income: { thisCents: number; lastCents: number };
  expenses: { thisCents: number; lastCents: number };
  /** Biggest movements, largest first (up to `limit`). */
  changes: CategoryChange[];
  /** False when there's nothing recorded in either month. */
  hasData: boolean;
}

/** Ignore movements smaller than this (minor units)... */
export const MIN_CHANGE_CENTS = 1000;
/** ...or smaller than this share of the earlier month's figure. */
export const MIN_CHANGE_SHARE = 0.15;

export function compareLastTwoMonths(entries: Entry[], today: string, limit = 3): MonthComparison {
  const month = previousMonth(monthOf(today));
  const previous = previousMonth(month);

  const totals = { income: { thisCents: 0, lastCents: 0 }, expenses: { thisCents: 0, lastCents: 0 } };
  const byCat = new Map<string, { kind: "income" | "expense"; category: string; thisCents: number; lastCents: number; entries: Entry[] }>();

  for (const e of entries) {
    if (e.pending || e.kind === "other" || e.amountCents <= 0) continue;
    const m = monthOf(e.date);
    if (m !== month && m !== previous) continue;
    const isThis = m === month;
    const bucket = e.kind === "income" ? totals.income : totals.expenses;
    if (isThis) bucket.thisCents += e.amountCents; else bucket.lastCents += e.amountCents;

    const key = `${e.kind}|${e.category}`;
    const c = byCat.get(key) ?? { kind: e.kind, category: e.category, thisCents: 0, lastCents: 0, entries: [] };
    if (isThis) { c.thisCents += e.amountCents; c.entries.push(e); } else { c.lastCents += e.amountCents; }
    byCat.set(key, c);
  }

  const changes: CategoryChange[] = [];
  for (const c of byCat.values()) {
    const delta = c.thisCents - c.lastCents;
    const abs = Math.abs(delta);
    if (abs < MIN_CHANGE_CENTS) continue;
    if (c.lastCents > 0 && abs < c.lastCents * MIN_CHANGE_SHARE) continue;
    const biggest = [...c.entries]
      .sort((a, b) => b.amountCents - a.amountCents || a.date.localeCompare(b.date))
      .slice(0, 3)
      .map((e) => ({ description: e.description, date: e.date, amountCents: e.amountCents }));
    changes.push({ kind: c.kind, category: c.category, thisCents: c.thisCents, lastCents: c.lastCents, deltaCents: delta, biggest });
  }
  changes.sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents) || a.category.localeCompare(b.category));

  const hasData = totals.income.thisCents + totals.income.lastCents + totals.expenses.thisCents + totals.expenses.lastCents > 0;
  return { month, previous, ...totals, changes: changes.slice(0, limit), hasData };
}

/** One plain sentence for a category change. */
export function describeChange(c: CategoryChange, cmp: MonthComparison, money: (cents: number) => string): string {
  const now = monthName(cmp.month);
  const before = monthName(cmp.previous);
  const word = c.kind === "income" ? "earned from" : "spent on";
  if (c.lastCents === 0) {
    return `${money(c.thisCents)} ${word} ${c.category} in ${now}, with nothing in ${before}.`;
  }
  if (c.thisCents === 0) {
    return `Nothing ${word} ${c.category} in ${now}, against ${money(c.lastCents)} in ${before}.`;
  }
  const dir = c.deltaCents > 0 ? "up" : "down";
  return `${c.category}: ${money(c.thisCents)} in ${now}, ${dir} ${money(Math.abs(c.deltaCents))} on ${before}.`;
}

/** "Largest: Shell fuel £45.00, Shell fuel £44.00." Only for rises, where the entries explain it. */
export function describeDrivers(c: CategoryChange, money: (cents: number) => string): string {
  if (c.deltaCents <= 0 || c.biggest.length === 0) return "";
  return `Largest: ${c.biggest.map((b) => `${b.description || "(no description)"} ${money(b.amountCents)}`).join(", ")}.`;
}
