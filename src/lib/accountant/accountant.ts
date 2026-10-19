/**
 * accountant — the bridge to a human accountant. Two parts:
 *  1) A per-transaction "discuss with accountant" flag.
 *  2) An "accountant pack" the user can send: a plain summary of flagged items
 *     plus the provisional statements + a transactions CSV (already provisional-
 *     labelled). A live read-only share LINK needs a backend, so it's signposted
 *     as coming soon; the pack works today with no backend.
 */

import { db } from "../db";
import { getApprovedTransactions } from "../ledger";
import { formatCurrency } from "../currency";
import { computeSA103 } from "../statements/sa103";
import type { TaxRegion } from "../regions";
import { loadBooksCheck } from "../bookscheck/load";
import { checksNoteLines } from "../bookscheck/bookscheck";
import { localToday } from "../bookscheck/entries";

export async function setAccountantFlag(txId: string, flagged: boolean): Promise<void> {
  const tx = await db.transactions.get(txId);
  if (!tx) return;
  await db.transactions.put({ ...tx, flag_accountant: flagged, last_modified: Date.now() });
}

export interface FlaggedItem {
  id: string;
  date: string;
  description: string;
  amount: number; // net magnitude in cents (sum of expense/income legs)
}

export async function getFlaggedTransactions(): Promise<FlaggedItem[]> {
  const txns = await getApprovedTransactions();
  return txns
    .filter((t: any) => t.flag_accountant)
    .map((t: any) => {
      // Show the largest-magnitude split as the headline amount.
      const amount = t.splits.reduce((max: number, s: any) => Math.max(max, Math.abs(s.amount)), 0);
      return { id: t.id, date: t.date, description: t.description, amount };
    })
    .sort((a: FlaggedItem, b: FlaggedItem) => a.date.localeCompare(b.date));
}

/** Build a plain-text accountant note listing flagged items. */
export async function buildAccountantNote(
  region: TaxRegion,
  businessName = "",
  range?: { from: string; to: string },
): Promise<string> {
  const items = await getFlaggedTransactions();
  const lines: string[] = [];
  lines.push(`LedgerJack — items to discuss${businessName ? ` (${businessName})` : ""}`);
  lines.push(`Prepared ${new Date().toISOString().slice(0, 10)}. Provisional figures prepared by the client, not a qualified accountant.`);
  lines.push("");

  // Provisional SA103 headline (UK), so the accountant sees the shape at a glance.
  if (region === "uk" && range) {
    try {
      const sa = await computeSA103(range.from, range.to);
      lines.push(`Tax year ${range.from} to ${range.to} (provisional):`);
      lines.push(`  Turnover:        ${formatCurrency(sa.turnover, region)}`);
      lines.push(`  Total expenses:  ${formatCurrency(sa.totalExpenses, region)}`);
      lines.push(`  Net profit:      ${formatCurrency(sa.netProfit, region)}`);
      lines.push("");
    } catch { /* skip headline if it can't be computed */ }
  }

  if (items.length === 0) {
    lines.push("No transactions have been flagged for discussion.");
  } else {
    lines.push(`${items.length} item(s) flagged for discussion:`);
    for (const it of items) {
      lines.push(`- ${it.date}  ${formatCurrency(it.amount, region)}  ${it.description}`);
    }
  }
  lines.push("");

  // Results of the on-device books check, so the accountant gets books that
  // have already been looked over. Best-effort: the note still goes without it.
  if (range) {
    try {
      const report = await loadBooksCheck(range.from, range.to, localToday());
      lines.push(...checksNoteLines(report, (c) => formatCurrency(c, region)));
      lines.push("");
    } catch { /* skip the checks section if it can't be computed */ }
  }

  lines.push("A full transactions CSV and a provisional SA103 + statements CSV are attached separately from LedgerJack.");
  return lines.join("\n");
}
