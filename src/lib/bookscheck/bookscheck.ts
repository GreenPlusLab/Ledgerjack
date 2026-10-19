/**
 * bookscheck — "things worth a look" in the user's entries.
 *
 * The Health check (selfCheck.ts) asks "is the data intact?". This asks a
 * different question: "do the entries themselves look right?" It catches the
 * everyday slips that cost money at year end: the same receipt saved twice,
 * a typo that adds a zero, an expense with no receipt, a date in the future,
 * a month with nothing recorded.
 *
 * Rules for this module:
 *  - Pure and read-only. It never changes an entry; the user decides.
 *  - No AI, no network. Everything runs on the device.
 *  - It never states a tax rule. Findings say what looks unusual, not what
 *    the law requires.
 *  - Amounts stay in integer minor units. Formatting is left to the caller.
 */

import {
  type Entry,
  daysBetween,
  addDays,
  monthOf,
  monthsBetween,
  monthName,
  previousMonth,
} from "./entries";

export type FindingSeverity = "check" | "info";

export type FindingId =
  | "possible-duplicates"
  | "unusual-amounts"
  | "future-dates"
  | "no-receipt"
  | "quiet-months"
  | "pending-review";

export interface FindingItem {
  /** The entry this item points at. Absent for month-level items. */
  txId?: string;
  /** YYYY-MM-DD for entries, YYYY-MM for month-level items. */
  date: string;
  description: string;
  amountCents?: number;
  /** The other entry, for a possible duplicate pair. */
  relatedTxId?: string;
  relatedDate?: string;
  relatedDescription?: string;
  /** For unusual amounts: the typical (median) amount in that category. */
  typicalCents?: number;
  /** For quiet months: what is missing. */
  missing?: ("income" | "expenses")[];
  category?: string;
}

export interface Finding {
  id: FindingId;
  severity: FindingSeverity;
  items: FindingItem[];
  /** Sum of item amounts, where that is meaningful. */
  totalCents?: number;
}

export interface BooksCheckReport {
  period: { from: string; to: string };
  findings: Finding[];
  /** Entries looked at in the period (approved and pending). */
  entriesChecked: number;
}

export interface BooksCheckOptions {
  /** Period to check, inclusive, YYYY-MM-DD (normally the current tax year). */
  from: string;
  to: string;
  /** Today on the user's clock, YYYY-MM-DD. */
  today: string;
}

// ── Tunable thresholds (kept here so tests and docs can name them) ───────────

/** Two entries this many days apart (or fewer) can be a duplicate pair. */
export const DUPLICATE_DAY_WINDOW = 3;
/** An amount this many times the category's usual amount is flagged... */
export const UNUSUAL_RATIO = 3;
/** ...but only if it is also at least this much (minor units) above usual. */
export const UNUSUAL_MIN_GAP_CENTS = 2000;
/** A category needs this many other entries before "usual" means anything. */
export const UNUSUAL_MIN_HISTORY = 4;
/** Dates more than this many days after today are flagged (allows for time zones). */
export const FUTURE_GRACE_DAYS = 1;

// ── Description matching ──────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the", "and", "for", "from", "ltd", "limited", "plc", "llp", "inc", "co",
  "payment", "card", "purchase", "paid", "pay", "to", "of", "at", "via",
  "pos", "contactless", "debit", "credit", "transfer", "ref", "online",
  "uk", "gb", "london", "receipt", "invoice",
]);

/** Meaningful words of a description: lower-case letters only, 3+ chars, no filler. */
export function keyWords(description: string): Set<string> {
  const words = description.toLowerCase().match(/[a-zÀ-ɏ]{3,}/g) ?? [];
  return new Set(words.filter((w) => !STOP_WORDS.has(w)));
}

export function similarDescriptions(a: string, b: string): boolean {
  const wa = keyWords(a);
  const wb = keyWords(b);
  if (wa.size === 0 && wb.size === 0) return a.trim().toLowerCase() === b.trim().toLowerCase();
  for (const w of wa) if (wb.has(w)) return true;
  return false;
}

// ── Individual checks ─────────────────────────────────────────────────────────

/**
 * Possible duplicates: same kind and exact amount, close in date, and either
 * the same day in the same category, or similar descriptions within a few days.
 * Pending entries are included on purpose: a scanned receipt and the same line
 * from a bank import is the most common way a cost gets counted twice.
 * Each entry appears in at most one pair.
 */
export function findPossibleDuplicates(entries: Entry[], from: string, to: string): FindingItem[] {
  const pool = entries
    .filter((e) => e.kind !== "other" && e.amountCents > 0 && e.date >= from && e.date <= to)
    .sort((a, b) => (a.amountCents - b.amountCents) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const used = new Set<string>();
  const items: FindingItem[] = [];

  for (let i = 0; i < pool.length; i++) {
    const a = pool[i];
    if (used.has(a.id)) continue;
    for (let j = i + 1; j < pool.length && pool[j].amountCents === a.amountCents; j++) {
      const b = pool[j];
      if (used.has(b.id) || b.kind !== a.kind) continue;
      const days = daysBetween(a.date, b.date);
      // Same amounts are sorted by date, so every later one is further away.
      if (days > DUPLICATE_DAY_WINDOW) break;
      const sameDaySameCategory = days === 0 && a.category === b.category;
      const similar = similarDescriptions(a.description, b.description);
      if (!sameDaySameCategory && !similar) continue;

      used.add(a.id);
      used.add(b.id);
      items.push({
        txId: a.id,
        date: a.date,
        description: a.description,
        amountCents: a.amountCents,
        category: a.category,
        relatedTxId: b.id,
        relatedDate: b.date,
        relatedDescription: b.description,
      });
      break;
    }
  }
  return items.sort((x, y) => x.date.localeCompare(y.date));
}

/**
 * Median of a sorted list with one occurrence of `value` left out. O(log n),
 * so a category with thousands of entries stays fast on a cheap phone.
 */
export function medianWithout(sorted: number[], value: number): number {
  // Find an occurrence of `value` (any one: equal values are interchangeable).
  let lo = 0;
  let hi = sorted.length - 1;
  let at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] === value) { at = mid; break; }
    if (sorted[mid] < value) lo = mid + 1; else hi = mid - 1;
  }
  const m = at === -1 ? sorted.length : sorted.length - 1;
  if (m <= 0) return 0;
  const get = (k: number) => (at === -1 || k < at ? sorted[k] : sorted[k + 1]);
  return m % 2 ? get((m - 1) / 2) : Math.round((get(m / 2 - 1) + get(m / 2)) / 2);
}

/**
 * Unusual amounts: an entry far above what that category usually sees, which
 * is how a misplaced decimal point or an extra zero shows up. "Usual" is the
 * median of the other approved entries in the same kind and category, across
 * all of the user's history; only entries inside the period are flagged.
 */
export function findUnusualAmounts(entries: Entry[], from: string, to: string): FindingItem[] {
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    if (e.kind === "other" || e.pending || e.amountCents <= 0) continue;
    const key = `${e.kind}|${e.category}`;
    const g = groups.get(key) ?? [];
    g.push(e);
    groups.set(key, g);
  }

  const flagged: { item: FindingItem; ratio: number }[] = [];
  for (const group of groups.values()) {
    if (group.length < UNUSUAL_MIN_HISTORY + 1) continue;
    const sorted = group.map((g) => g.amountCents).sort((a, b) => a - b);
    for (const e of group) {
      if (e.date < from || e.date > to) continue;
      const usual = medianWithout(sorted, e.amountCents);
      if (usual <= 0) continue;
      if (e.amountCents >= usual * UNUSUAL_RATIO && e.amountCents - usual >= UNUSUAL_MIN_GAP_CENTS) {
        flagged.push({
          item: {
            txId: e.id,
            date: e.date,
            description: e.description,
            amountCents: e.amountCents,
            category: e.category,
            typicalCents: usual,
          },
          ratio: e.amountCents / usual,
        });
      }
    }
  }
  return flagged.sort((a, b) => b.ratio - a.ratio).map((f) => f.item);
}

/** Dates after today: usually a typo in the year or month. */
export function findFutureDates(entries: Entry[], today: string): FindingItem[] {
  const limit = addDays(today, FUTURE_GRACE_DAYS);
  return entries
    .filter((e) => e.date > limit)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({ txId: e.id, date: e.date, description: e.description, amountCents: e.amountCents || undefined, category: e.category }));
}

/**
 * Expenses with no receipt photo attached. Mileage is left out because it is
 * worked out from a trip log, not a receipt. Biggest first.
 */
export function findMissingReceipts(entries: Entry[], from: string, to: string): FindingItem[] {
  return entries
    .filter((e) => e.kind === "expense" && !e.pending && !e.isMileage && !e.hasReceipt && e.amountCents > 0 && e.date >= from && e.date <= to)
    .sort((a, b) => b.amountCents - a.amountCents || a.date.localeCompare(b.date))
    .map((e) => ({ txId: e.id, date: e.date, description: e.description, amountCents: e.amountCents, category: e.category }));
}

/**
 * Quiet months: complete months inside the period with no income or no
 * expenses recorded. Only months from the user's first ever entry onwards are
 * considered, so a new user isn't told about months before they started, and
 * only once the user has entries in at least two different months.
 */
export function findQuietMonths(entries: Entry[], from: string, to: string, today: string): FindingItem[] {
  const recorded = entries.filter((e) => e.kind !== "other" && !e.pending);
  if (recorded.length === 0) return [];
  const distinctMonths = new Set(recorded.map((e) => monthOf(e.date)));
  if (distinctMonths.size < 2) return [];

  const firstMonth = recorded.reduce((m, e) => (monthOf(e.date) < m ? monthOf(e.date) : m), monthOf(recorded[0].date));
  const lastComplete = previousMonth(monthOf(today));
  const start = [monthOf(from), firstMonth].sort()[1];
  const end = [monthOf(to), lastComplete].sort()[0];
  if (start > end) return [];

  const incomeMonths = new Set(recorded.filter((e) => e.kind === "income").map((e) => monthOf(e.date)));
  const expenseMonths = new Set(recorded.filter((e) => e.kind === "expense").map((e) => monthOf(e.date)));

  const items: FindingItem[] = [];
  for (const m of monthsBetween(start, end)) {
    const missing: ("income" | "expenses")[] = [];
    if (incomeMonths.size > 0 && !incomeMonths.has(m)) missing.push("income");
    if (expenseMonths.size > 0 && !expenseMonths.has(m)) missing.push("expenses");
    if (missing.length) items.push({ date: m, description: "", missing });
  }
  return items;
}

/** Entries still waiting in the review queue, so not counted in totals yet. */
export function findPending(entries: Entry[]): FindingItem[] {
  return entries
    .filter((e) => e.pending)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({ txId: e.id, date: e.date, description: e.description, amountCents: e.amountCents || undefined, category: e.category }));
}

// ── The full check ────────────────────────────────────────────────────────────

const sum = (items: FindingItem[]) => items.reduce((t, i) => t + (i.amountCents ?? 0), 0);

export function runBooksCheck(entries: Entry[], opts: BooksCheckOptions): BooksCheckReport {
  const { from, to, today } = opts;
  const findings: Finding[] = [];

  const dupes = findPossibleDuplicates(entries, from, to);
  if (dupes.length) findings.push({ id: "possible-duplicates", severity: "check", items: dupes, totalCents: sum(dupes) });

  const unusual = findUnusualAmounts(entries, from, to);
  if (unusual.length) findings.push({ id: "unusual-amounts", severity: "check", items: unusual });

  const future = findFutureDates(entries, today);
  if (future.length) findings.push({ id: "future-dates", severity: "check", items: future });

  const pending = findPending(entries);
  if (pending.length) findings.push({ id: "pending-review", severity: "info", items: pending });

  const noReceipt = findMissingReceipts(entries, from, to);
  if (noReceipt.length) findings.push({ id: "no-receipt", severity: "info", items: noReceipt, totalCents: sum(noReceipt) });

  const quiet = findQuietMonths(entries, from, to, today);
  if (quiet.length) findings.push({ id: "quiet-months", severity: "info", items: quiet });

  const entriesChecked = entries.filter((e) => e.date >= from && e.date <= to).length;
  return { period: { from, to }, findings, entriesChecked };
}

// ── Plain-English wording, shared by the screen and the accountant note ──────

export interface FindingText {
  title: string;
  summary: string;
}

/**
 * Words for a finding. `money` formats minor units in the user's currency.
 * Kept here so the screen and the accountant note say exactly the same thing.
 */
export function describeFinding(f: Finding, money: (cents: number) => string): FindingText {
  const n = f.items.length;
  const s = (one: string, many: string) => (n === 1 ? one : many);
  switch (f.id) {
    case "possible-duplicates":
      return {
        title: "Possible duplicates",
        summary: `${n} pair${s("", "s")} of entries with the same amount close together. If one is a copy, tap Review to correct or delete it, so the cost isn't counted twice. If both are real, you can ignore this.`,
      };
    case "unusual-amounts":
      return {
        title: "Unusual amounts",
        summary: `${n} entr${s("y is", "ies are")} much bigger than usual for ${s("its", "their")} category. Check for a misplaced decimal point or an extra zero.`,
      };
    case "future-dates":
      return {
        title: "Dates in the future",
        summary: `${n} entr${s("y is", "ies are")} dated after today, usually a typo in the year or month. ${s("It", "They")} may land in the wrong period.`,
      };
    case "pending-review":
      return {
        title: "Waiting for your review",
        summary: `${n} entr${s("y is", "ies are")} still in your review queue and ${s("isn't", "aren't")} in your totals yet.`,
      };
    case "no-receipt":
      return {
        title: "Expenses without a receipt",
        summary: `${n} expense${s("", "s")} (${money(f.totalCents ?? 0)}) ${s("has", "have")} no receipt photo. Receipts make it easier for you or your accountant to check an expense later. Mileage is left out.`,
      };
    case "quiet-months":
      return {
        title: "Months with nothing recorded",
        summary: `${n} month${s("", "s")} with no income or no expenses recorded. If you were working, something may be missing.`,
      };
  }
}

/** One line per item, for lists and the accountant note. */
export function describeItem(f: Finding, item: FindingItem, money: (cents: number) => string): string {
  const amt = item.amountCents !== undefined ? money(item.amountCents) : "";
  const desc = item.description || "(no description)";
  switch (f.id) {
    case "possible-duplicates":
      return `${amt}: "${desc}" (${item.date}) and "${item.relatedDescription || "(no description)"}" (${item.relatedDate})`;
    case "unusual-amounts":
      return `${item.date} · ${amt} · ${desc}. Usually about ${money(item.typicalCents ?? 0)} in ${item.category}.`;
    case "quiet-months": {
      const what = (item.missing ?? []).join(" or ");
      return `${monthName(item.date)} ${item.date.slice(0, 4)}: no ${what} recorded`;
    }
    default:
      return [item.date, amt, desc].filter(Boolean).join(" · ");
  }
}

/**
 * Most items listed per finding in the accountant note. Kept short because the
 * note is often sent through an email or chat link, which limits its length.
 */
export const NOTE_ITEM_LIMIT = 10;

/**
 * Lines for the accountant note: what the automatic check found, so the
 * accountant receives books that have already been looked over.
 */
export function checksNoteLines(report: BooksCheckReport, money: (cents: number) => string): string[] {
  const lines: string[] = [];
  lines.push(`Automatic checks (run by LedgerJack on the client's device, ${report.period.from} to ${report.period.to}):`);
  if (report.findings.length === 0) {
    lines.push("  Nothing stood out: no possible duplicates, unusual amounts or future dates.");
    return lines;
  }
  for (const f of report.findings) {
    const t = describeFinding(f, money);
    lines.push(`  ${t.title}: ${f.items.length}${f.totalCents !== undefined ? ` (${money(f.totalCents)})` : ""}`);
    // Counts are enough for these two; the full lists would swamp the note.
    if (f.id === "pending-review" || f.id === "no-receipt") continue;
    const shown = f.items.slice(0, NOTE_ITEM_LIMIT);
    for (const item of shown) lines.push(`    - ${describeItem(f, item, money)}`);
    if (f.items.length > shown.length) lines.push(`    ...and ${f.items.length - shown.length} more`);
  }
  lines.push("  These are prompts, not errors: the client may already have confirmed some of these entries.");
  return lines;
}

/** Overall status for the headline. */
export function overallStatus(report: BooksCheckReport): "clear" | "check" | "info" {
  if (report.findings.some((f) => f.severity === "check")) return "check";
  if (report.findings.length) return "info";
  return "clear";
}
