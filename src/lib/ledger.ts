import { v4 as uuidv4 } from 'uuid';
import { db, loadWithSplits, type DBTransaction, type DBSplit, type TransactionWithSplits } from './db';
import { encField, encAmount, canEncryptAtRest } from './atRest';

export type { DBTransaction, DBSplit, TransactionWithSplits };

export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerError';
  }
}

/**
 * Validates that all splits sum to exactly zero (debits positive, credits negative).
 * Uses integer arithmetic to avoid IEEE-754 drift.
 */
export function validateBalance(splits: Pick<DBSplit, 'amount'>[]): boolean {
  return splits.reduce((sum, s) => sum + s.amount, 0) === 0;
}

/**
 * Returns two balanced splits for a simple debit/credit pair.
 * amountCents must be a positive integer (e.g. £10.50 → 1050).
 */
export function makeSimpleSplits(
  debitAccount: string,
  creditAccount: string,
  amountCents: number,
): Omit<DBSplit, 'id' | 'transaction_id'>[] {
  return [
    { account_id: debitAccount,  amount: amountCents,  memo: null },
    { account_id: creditAccount, amount: -amountCents, memo: null },
  ];
}

/**
 * Atomically writes a transaction header + its splits.
 * Enforces: period-lock guard, ≥2 splits, zero-sum balance.
 */
export async function commitBalancedTransaction(
  tx: DBTransaction,
  splits: Omit<DBSplit, 'id' | 'transaction_id'>[],
): Promise<void> {
  if (tx.is_locked) {
    throw new LedgerError('Write rejected: this accounting period is frozen.');
  }
  if (splits.length < 2) {
    throw new LedgerError('Write rejected: a valid entry requires at least 2 splits.');
  }
  if (!validateBalance(splits)) {
    const imbalance = splits.reduce((s, sp) => s + sp.amount, 0);
    throw new LedgerError(
      `Write rejected: ledger imbalance of ${imbalance} subunits detected.`,
    );
  }

  // Encrypt sensitive fields BEFORE opening the Dexie transaction. WebCrypto is
  // async and foreign to Dexie — awaiting it inside db.transaction() would make
  // the transaction inactive and cause the write to fail. validateBalance ran on
  // the plaintext amounts above, so encrypting now doesn't affect integrity.
  // When no vault key is loaded, fields are stored plaintext (encField guards),
  // and amounts are kept plaintext too (no amount_enc) so they never read as 0.
  const vaultReady = canEncryptAtRest();
  const txAtRest: DBTransaction = { ...tx, description: await encField(tx.description) };
  const encSplits = await Promise.all(
    splits.map(async (s) => {
      const base = { ...s, id: uuidv4(), transaction_id: tx.id };
      if (vaultReady) {
        return { ...base, amount: 0, amount_enc: await encAmount(s.amount) };
      }
      return base; // plaintext amount, no amount_enc
    }),
  );

  await db.transaction('rw', [db.transactions, db.splits], async () => {
    await db.transactions.put(txAtRest);
    await db.splits.where('transaction_id').equals(tx.id).delete();
    await db.splits.bulkPut(encSplits);
  });
}

/**
 * Creates a new transaction and its splits, returning the saved transaction.
 */
export async function createTransaction(
  txFields: Omit<DBTransaction, 'id' | 'last_modified' | 'is_locked'>,
  splits: Omit<DBSplit, 'id' | 'transaction_id'>[],
): Promise<DBTransaction> {
  const record: DBTransaction = {
    ...txFields,
    id: uuidv4(),
    is_locked: false,
    last_modified: Date.now(),
  };
  await commitBalancedTransaction(record, splits);
  return record;
}

export async function updateTransaction(
  id: string,
  changes: Partial<Omit<DBTransaction, 'id' | 'last_modified'>>,
  splits?: Omit<DBSplit, 'id' | 'transaction_id'>[],
): Promise<void> {
  const existing = await db.transactions.get(id);
  if (!existing) throw new LedgerError('Transaction not found.');
  if (existing.is_locked) throw new LedgerError('Cannot modify a locked transaction.');

  const updated: DBTransaction = { ...existing, ...changes, last_modified: Date.now() };

  if (splits !== undefined) {
    await commitBalancedTransaction(updated, splits);
  } else {
    // encField is idempotent — an unchanged (already-encrypted) description is
    // left as-is; a newly-edited plaintext description gets encrypted.
    await db.transactions.put({ ...updated, description: await encField(updated.description) });
  }
}

export async function deleteTransaction(id: string): Promise<void> {
  const existing = await db.transactions.get(id);
  if (!existing) throw new LedgerError('Transaction not found.');
  if (existing.is_locked) throw new LedgerError('Cannot delete a locked transaction.');

  await db.transaction('rw', [db.transactions, db.splits, db.attachments], async () => {
    await db.splits.where('transaction_id').equals(id).delete();
    await db.transactions.delete(id);
    if (existing.attachment_id) await db.attachments.delete(existing.attachment_id);
  });
}

export async function approveTransaction(id: string): Promise<void> {
  const tx = await db.transactions.get(id);
  if (tx && !tx.date) throw new LedgerError('Add the date from the receipt before approving this entry.');
  if (tx?.review_flags?.includes('total-missing')) throw new LedgerError('Add the total from the receipt before approving this entry.');
  await db.transactions.update(id, { pending_review: false, review_flags: undefined, last_modified: Date.now() });
}

export async function lockTransaction(id: string): Promise<void> {
  await db.transactions.update(id, { is_locked: true, last_modified: Date.now() });
}

export async function getApprovedTransactions(): Promise<TransactionWithSplits[]> {
  // pending_review is a boolean, and IndexedDB cannot index booleans, so a
  // `.where('pending_review').equals(0)` index query returns nothing. Filter in
  // JS instead (matches getPendingTransactions and the dashboard).
  const txns = await db.transactions.filter((tx) => !tx.pending_review).toArray();
  return loadWithSplits(txns);
}

export async function getPendingTransactions(): Promise<TransactionWithSplits[]> {
  const txns = await db.transactions.filter((tx) => tx.pending_review).toArray();
  return loadWithSplits(txns);
}

export async function getTransactionsByDateRange(
  startDate: string,
  endDate: string,
): Promise<TransactionWithSplits[]> {
  const txns = await db.transactions
    .where('date')
    .between(startDate, endDate, true, true)
    .toArray();
  return loadWithSplits(txns);
}

export async function getTransactionsByJobTag(jobTag: string): Promise<TransactionWithSplits[]> {
  const txns = await db.transactions.where('job_tag').equals(jobTag).toArray();
  return loadWithSplits(txns);
}
