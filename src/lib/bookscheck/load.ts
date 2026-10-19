/**
 * load — reads the ledger for the books check, comparisons and "Ask your books".
 * Read-only. Goes through loadWithSplits (the read choke-point), so encrypted
 * descriptions and amounts are decrypted the same way as everywhere else.
 */

import { db, loadWithSplits, type DBAccountType } from "../db";
import { toEntries, type Entry } from "./entries";
import { runBooksCheck, type BooksCheckReport } from "./bookscheck";

export async function loadEntries(): Promise<Entry[]> {
  const [rawTxns, accounts, mileage] = await Promise.all([
    db.transactions.toArray(),
    db.accounts.toArray(),
    db.mileage_logs.toArray(),
  ]);
  const txns = await loadWithSplits(rawTxns);
  const types = new Map<string, DBAccountType>();
  for (const a of accounts) types.set(a.id, a.type);
  const mileageIds = new Set(mileage.map((m) => m.transaction_id));
  return toEntries(txns, types, mileageIds);
}

export async function loadBooksCheck(from: string, to: string, today: string): Promise<BooksCheckReport> {
  return runBooksCheck(await loadEntries(), { from, to, today });
}
