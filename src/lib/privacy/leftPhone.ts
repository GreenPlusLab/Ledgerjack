/**
 * "What left my phone" — a plain record of every time something went off this
 * device: which kind of thing, where to, and why. Never the content itself.
 *
 * Stored locally in db.settings like the AI usage tally. Kept for 13 months,
 * at most MAX_ENTRIES entries.
 */

export type LeftKind = "receipt-ai" | "question-ai" | "backup" | "export" | "hmrc";

export interface LeftEntry {
  /** ISO timestamp. */
  at: string;
  kind: LeftKind;
  /** Where it went, in plain words: "OpenRouter (GPT-4o mini)", "your Share menu", "HMRC". */
  to: string;
  /** Whether the thing was locked (encrypted) before it left. */
  locked: boolean;
}

export const MAX_ENTRIES = 2000;
export const KEEP_MONTHS = 13;

export const KIND_LABEL: Record<LeftKind, { one: string; many: string }> = {
  "receipt-ai": { one: "receipt sent for AI reading", many: "receipts sent for AI reading" },
  "question-ai": { one: "question sent to AI", many: "questions sent to AI" },
  backup: { one: "locked backup saved", many: "locked backups saved" },
  export: { one: "unlocked copy made or shared", many: "unlocked copies made or shared" },
  hmrc: { one: "submission sent to HMRC", many: "submissions sent to HMRC" },
};

export function addEntry(log: LeftEntry[], entry: LeftEntry, now = new Date()): LeftEntry[] {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - KEEP_MONTHS);
  const kept = log.filter((e) => new Date(e.at) >= cutoff);
  kept.push(entry);
  return kept.slice(-MAX_ENTRIES);
}

export function parseLog(raw: string | null | undefined): LeftEntry[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter(
      (e): e is LeftEntry =>
        !!e && typeof e.at === "string" && typeof e.to === "string" && typeof e.locked === "boolean" && e.kind in KIND_LABEL,
    );
  } catch {
    return [];
  }
}

export interface MonthSummary {
  /** "YYYY-MM" */
  month: string;
  lines: string[];
  /** True when nothing left the phone that month. */
  nothing: boolean;
}

/** One plain sentence per kind and destination, e.g. "3 receipts sent for AI reading to OpenRouter (GPT-4o mini)." */
export function summariseMonth(log: LeftEntry[], month: string): MonthSummary {
  const inMonth = log.filter((e) => e.at.slice(0, 7) === month);
  const groups = new Map<string, { kind: LeftKind; to: string; n: number }>();
  for (const e of inMonth) {
    const k = `${e.kind}|${e.to}`;
    const g = groups.get(k) ?? { kind: e.kind, to: e.to, n: 0 };
    g.n += 1;
    groups.set(k, g);
  }
  const order: LeftKind[] = ["receipt-ai", "question-ai", "backup", "export", "hmrc"];
  const lines = [...groups.values()]
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.to.localeCompare(b.to))
    .map((g) => `${g.n} ${g.n === 1 ? KIND_LABEL[g.kind].one : KIND_LABEL[g.kind].many} to ${g.to}.`);
  return { month, lines, nothing: lines.length === 0 };
}

/** Months with entries, newest first, always including the current month. */
export function monthsToShow(log: LeftEntry[], now = new Date()): string[] {
  const current = now.toISOString().slice(0, 7);
  const set = new Set<string>([current, ...log.map((e) => e.at.slice(0, 7))]);
  return [...set].sort().reverse();
}
