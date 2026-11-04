/**
 * Checks on a receipt that was read by AI or by text recognition.
 *
 * These never change what was read and never block a choice. They tell the
 * person, in plain words, exactly what looks wrong, so they can check it
 * against the receipt. Full attention is still required on every receipt:
 * a reading with no warnings can still be wrong.
 *
 * Two forms:
 *  - `checkReading` returns messages for the screen, which may include amounts.
 *  - The flag codes are what gets stored with a pending entry. They are plain
 *    codes with no amounts or names in them, because they are not encrypted.
 */

export type ReadingFlag =
  | "date-missing"
  | "date-future"
  | "date-old"
  | "total-missing"
  | "shop-missing"
  | "items-mismatch"
  | "split-mismatch"
  | "unsure-amount"
  | "unsure-category"
  | "unsure-reading";

/** Stored-flag wording (no amounts), shown in Review. */
export const FLAG_TEXT: Record<ReadingFlag, string> = {
  "date-missing": "The date wasn't clear. Please add it from the receipt.",
  "date-future": "The date looks like it's after today. Worth checking the day, month and year.",
  "date-old": "The date is more than a year ago. Worth checking the year, as the date decides which tax period this goes in.",
  "total-missing": "The total wasn't clear. Please add it from the receipt.",
  "shop-missing": "The shop or supplier name wasn't clear.",
  "items-mismatch": "The items don't quite add up to the total. Worth a quick look at the total.",
  "split-mismatch": "The suggested parts don't quite add up to the total.",
  "unsure-amount": "The reader wasn't sure about the total. Worth a quick look.",
  "unsure-category": "The reader wasn't sure about the category. Worth a quick look.",
  "unsure-reading": "Part of this receipt was hard to read. Worth a quick look at each field.",
};

/** Which part of the entry each flag is about, so only that part is highlighted. */
export type ReadingField = "date" | "amount" | "description" | "category";
export const FLAG_FIELD: Record<ReadingFlag, ReadingField[]> = {
  "date-missing": ["date"],
  "date-future": ["date"],
  "date-old": ["date"],
  "total-missing": ["amount"],
  "shop-missing": ["description"],
  "items-mismatch": ["amount"],
  "split-mismatch": ["amount"],
  "unsure-amount": ["amount"],
  "unsure-category": ["category"],
  "unsure-reading": ["date", "amount", "description"],
};

/** The parts of an entry that need a look, from its flags. */
export function fieldsToCheck(flags: Iterable<ReadingFlag>): Set<ReadingField> {
  const out = new Set<ReadingField>();
  for (const f of flags) for (const field of FLAG_FIELD[f]) out.add(field);
  return out;
}

/** Flags that leave the entry incomplete: it can't be approved until they're fixed. */
export const MUST_FIX: ReadonlySet<ReadingFlag> = new Set(["date-missing", "total-missing"]);

export const ALL_FLAGS = Object.keys(FLAG_TEXT) as ReadingFlag[];

export function isReadingFlag(v: unknown): v is ReadingFlag {
  return typeof v === "string" && (ALL_FLAGS as string[]).includes(v);
}

/** True for a real calendar date written YYYY-MM-DD. */
export function isRealDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The date as read, or "" when it is missing or not a real date. Never guesses. */
export function cleanDate(v: unknown): string {
  return isRealDate(v) ? v : "";
}

const DAY_MS = 86_400_000;

export interface ReadingToCheck {
  date: string;
  /** Total in pence (minor units). */
  amount: number;
  description?: string;
  /** Item totals in pence. */
  itemTotals?: number[];
  /** Suggested part amounts in pence. */
  splitAmounts?: number[];
  /** The AI's own confidence, 0 to 1; undefined when not an AI reading. */
  amountConfidence?: number;
  categoryConfidence?: number;
}

export interface ReadingIssue {
  flag: ReadingFlag;
  message: string;
}

const UNSURE_BELOW = 0.8;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * What looks wrong with a reading. `fmt` turns pence into money text for the
 * screen; `today` is YYYY-MM-DD.
 */
export function checkReading(r: ReadingToCheck, today: string, fmt: (minor: number) => string): ReadingIssue[] {
  const out: ReadingIssue[] = [];
  const add = (flag: ReadingFlag, message = FLAG_TEXT[flag]) => out.push({ flag, message });

  if (!isRealDate(r.date)) add("date-missing");
  else if (r.date > today) add("date-future", `The date reads ${r.date}, which is after today. Worth checking the day, month and year.`);
  else if (isRealDate(today) && Date.parse(today) - Date.parse(r.date) > 365 * DAY_MS)
    add("date-old", `The date reads ${r.date}, more than a year ago. Worth checking the year, as the date decides which tax period this goes in.`);

  const hasTotal = Number.isFinite(r.amount) && r.amount > 0;
  if (!hasTotal) add("total-missing");

  if (!r.description || !r.description.trim() || r.description.trim().toLowerCase() === "unknown") add("shop-missing");

  const items = (r.itemTotals ?? []).filter((n) => Number.isFinite(n));
  if (hasTotal && items.length > 1) {
    const s = sum(items);
    if (Math.abs(s - r.amount) > items.length) {
      add("items-mismatch", `The items add up to ${fmt(s)}, and the total reads ${fmt(r.amount)}. That's fine if there's a discount, delivery charge or tip. If not, worth a quick look at the total.`);
    }
  }

  const parts = (r.splitAmounts ?? []).filter((n) => Number.isFinite(n));
  if (hasTotal && parts.length > 1) {
    const s = sum(parts);
    if (Math.abs(s - r.amount) > parts.length) {
      add("split-mismatch", `The suggested parts add up to ${fmt(s)}, and the total reads ${fmt(r.amount)}.`);
    }
  }

  // The AI's own score. Missing counts as unsure, but only for AI readings.
  const unsure = (v: number | undefined) => !(typeof v === "number" && Number.isFinite(v) && v >= UNSURE_BELOW);
  if ("amountConfidence" in r && hasTotal && unsure(r.amountConfidence)) add("unsure-amount");
  if ("categoryConfidence" in r && unsure(r.categoryConfidence)) add("unsure-category");

  return out;
}

/** Just the codes, for storing with a pending entry. */
export function flagsOf(issues: ReadingIssue[]): ReadingFlag[] {
  return [...new Set(issues.map((i) => i.flag))];
}

/** Read stored flags safely (ignores anything unknown). */
export function storedFlags(v: unknown): ReadingFlag[] {
  return Array.isArray(v) ? v.filter(isReadingFlag) : [];
}
