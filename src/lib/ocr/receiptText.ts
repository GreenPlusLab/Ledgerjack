/**
 * receiptText — turn text read from a receipt photo (on the phone) into
 * suggested fields: total, VAT, date and shop name.
 *
 * Suggestions only. The person checks every field before saving, and anything
 * the text can't settle is left empty or flagged, never guessed: if no clear
 * "total" line is found, no total is suggested.
 */

export type DateOrder = "DMY" | "MDY";

export interface ReceiptSuggestion {
  /** Total in minor units (pence/cents), if a clear total line was found. */
  totalMinor?: number;
  vatMinor?: number;
  /** YYYY-MM-DD */
  date?: string;
  merchant?: string;
  /** Plain warnings to show with the suggestions. */
  notes: string[];
}

const AMOUNT = /(?:£|\$|€|GBP|USD|EUR)?\s*(-?\d{1,3}(?:,\d{3})*\.\d{2}|-?\d+\.\d{2})(?!\d)/g;

/** "1,234.56" → 123456. Integer maths only. */
export function toMinor(text: string): number | null {
  const t = text.replace(/[£$€\s]|GBP|USD|EUR/g, "").replace(/,/g, "");
  const m = /^(-?)(\d+)\.(\d{2})$/.exec(t);
  if (!m) return null;
  const v = Number(m[2]) * 100 + Number(m[3]);
  return Number.isSafeInteger(v) ? (m[1] ? -v : v) : null;
}

function amountsIn(line: string): number[] {
  const out: number[] = [];
  for (const m of line.matchAll(AMOUNT)) {
    const v = toMinor(m[1]!);
    if (v !== null) out.push(v);
  }
  return out;
}

const STRONG_TOTAL = /\b(grand\s*total|total\s*to\s*pay|amount\s*due|balance\s*due|total\s*due|amount\s*to\s*pay)\b/i;
const PLAIN_TOTAL = /\btotal\b/i;
const NOT_TOTAL = /sub\s*-?\s*total|total\s*(vat|tax)|vat\s*total|tax\s*total|total\s*sav|savings|items?\s*total|total\s*items|no\.?\s*of\s*items|total\s*qty|total\s*quantity/i;
const VAT_LINE = /\b(vat|tax)\b/i;
const NOT_VAT = /vat\s*(no|number|reg)|tax\s*(no|number|id)|\d+(\.\d+)?\s*%\s*$/i;

function totalFrom(lines: string[]): { minor?: number; note?: string } {
  const pick = (re: RegExp) => {
    const hits: number[] = [];
    lines.forEach((l, i) => {
      if (!re.test(l) || NOT_TOTAL.test(l)) return;
      const here = amountsIn(l);
      const v = here.length ? here[here.length - 1] : amountsIn(lines[i + 1] ?? "")[0];
      if (v !== undefined) hits.push(v);
    });
    return hits;
  };
  const strong = pick(STRONG_TOTAL);
  if (strong.length) return { minor: strong[0] };
  const plain = pick(PLAIN_TOTAL);
  if (plain.length === 0) return { note: "No total line was found, so the amount is left for you to type." };
  const distinct = [...new Set(plain)];
  if (distinct.length > 1) return { note: "The receipt shows more than one total, so the amount is left for you to type." };
  return { minor: distinct[0] };
}

function vatFrom(lines: string[]): number | undefined {
  for (const l of lines) {
    if (!VAT_LINE.test(l) || NOT_VAT.test(l)) continue;
    // "TOTAL 12.00 inc VAT" is the total, not the VAT.
    if (PLAIN_TOTAL.test(l) && !/total\s*(vat|tax)|(vat|tax)\s*total/i.test(l)) continue;
    if (/inc(l|luding)?\.?\s*(vat|tax)/i.test(l)) continue;
    const a = amountsIn(l);
    if (a.length) return a[a.length - 1];
  }
  return undefined;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

function valid(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const fullYear = (y: number) => (y < 100 ? 2000 + y : y);

/** The first date in the text, read in the region's order; flags any doubt. */
export function dateFrom(text: string, order: DateOrder): { date?: string; note?: string } {
  let m = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(text);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (valid(y, mo, d)) return { date: iso(y, mo, d) };
  }
  m = /\b(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s*,?\s*(\d{2,4})\b/i.exec(text);
  if (m) {
    const [d, mo, y] = [Number(m[1]), MONTHS[m[2]!.toLowerCase()]!, fullYear(Number(m[3]))];
    if (valid(y, mo, d)) return { date: iso(y, mo, d) };
  }
  m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s*(\d{1,2}),?\s*(\d{4})\b/i.exec(text);
  if (m) {
    const [mo, d, y] = [MONTHS[m[1]!.toLowerCase()]!, Number(m[2]), Number(m[3])];
    if (valid(y, mo, d)) return { date: iso(y, mo, d) };
  }
  m = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/.exec(text);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]), y = fullYear(Number(m[3]));
    const dmy = valid(y, b, a), mdy = valid(y, a, b);
    if (dmy && mdy && a !== b) {
      const date = order === "DMY" ? iso(y, b, a) : iso(y, a, b);
      return { date, note: "The date could be read two ways. Check the day and month." };
    }
    if (dmy && (order === "DMY" || !mdy)) return { date: iso(y, b, a) };
    if (mdy) return { date: iso(y, a, b) };
  }
  return { note: "No date was found. Type the date from the receipt." };
}

const BOILERPLATE = /receipt|invoice|tel\b|phone|vat\s*(no|reg)|www\.|http|date|time|till|cashier|welcome|thank/i;

function merchantFrom(lines: string[]): string | undefined {
  for (const l of lines.slice(0, 6)) {
    const letters = (l.match(/[A-Za-z]/g) ?? []).length;
    if (letters >= 3 && !BOILERPLATE.test(l) && amountsIn(l).length === 0) return l.slice(0, 60);
  }
  return undefined;
}

export function suggestFromReceiptText(text: string, order: DateOrder, today: string): ReceiptSuggestion {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const notes: string[] = [];
  const s: ReceiptSuggestion = { notes };

  const total = totalFrom(lines);
  if (total.minor !== undefined) {
    if (total.minor <= 0) notes.push("The total read as zero or less. Check it.");
    else s.totalMinor = total.minor;
  } else if (total.note) notes.push(total.note);

  const vat = vatFrom(lines);
  if (vat !== undefined && vat > 0) {
    if (s.totalMinor !== undefined && vat > s.totalMinor) notes.push("The VAT read as more than the total, so it was left out.");
    else s.vatMinor = vat;
  }

  const d = dateFrom(text, order);
  if (d.date) {
    s.date = d.date;
    if (d.date > today) notes.push("The date is after today. Check the year and month.");
  }
  if (d.note) notes.push(d.note);

  const merchant = merchantFrom(lines);
  if (merchant) s.merchant = merchant;
  return s;
}

/** Day-month-year everywhere except the United States. */
export function dateOrderFor(region: string): DateOrder {
  return region === "us" ? "MDY" : "DMY";
}
