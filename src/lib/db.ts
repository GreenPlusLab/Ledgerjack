import Dexie, { type Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid';
import { decField, decAmount } from './atRest';

// ── Account ───────────────────────────────────────────────────────────────────

export type DBAccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

export interface DBAccount {
  /** Path-style unique key (e.g. "Expenses:Travel:Mileage") — equals name */
  id: string;
  name: string;
  type: DBAccountType;
  parent?: string;
  placeholder: boolean;
  sort_order: number;
}

// ── Transaction & Split ───────────────────────────────────────────────────────

/**
 * Header record for a double-entry transaction.
 * Splits live in a separate table, lazy-loaded to keep transaction queries fast.
 */
export interface DBTransaction {
  id: string;
  date: string;
  description: string;
  job_tag?: string;
  /** Which business/trade this belongs to (for multi-trade + MTD). Optional. */
  trade?: string;
  /** Marked by the user to discuss with their accountant. Optional. */
  flag_accountant?: boolean;
  attachment_id?: string;
  /** True when AI-parsed or CSV-imported and awaiting human review */
  pending_review: boolean;
  /**
   * What looked wrong when the receipt was read (codes from
   * lib/ai/readingChecks, no amounts or names). Shown in Review; cleared when
   * the person edits or approves the entry.
   */
  review_flags?: string[];
  /** True when the fiscal period is closed — writes are rejected */
  is_locked: boolean;
  last_modified: number;
}

/**
 * GnuCash-style split.
 * amount is signed integer subunits (e.g. £10.50 = 1050).
 * Debit entries are positive; credit entries are negative.
 * The sum of all splits on a transaction must equal exactly zero.
 */
export interface DBSplit {
  id: string;
  transaction_id: string;
  /** Account path (e.g. "Expenses:Travel:Parking") */
  account_id: string;
  /** Signed integer cents — debit > 0, credit < 0 */
  amount: number;
  /** At-rest encrypted amount (marker string). When present, `amount` is 0 on disk. */
  amount_enc?: string;
  memo: string | null;
}

/** Transaction with its splits eagerly loaded (used by views) */
export interface TransactionWithSplits extends DBTransaction {
  splits: DBSplit[];
}

// ── Attachments ───────────────────────────────────────────────────────────────

export interface DBAttachment {
  id: string;
  transaction_id: string;
  encrypted_iv: Uint8Array;
  encrypted_data: Uint8Array;
  mime_type: string;
  created_at: number;
}

// ── Crypto Envelope ───────────────────────────────────────────────────────────

/** Persisted KEK-wrapped Master Data Key envelope */
export interface DBCryptoEnvelope {
  id: 'master_mdk_envelope';
  salt: string;
  iv: string;
  encrypted_mdk: string;
  /** PBKDF2 iteration count used when this envelope was sealed.
   *  Stored so future unlocks use the right derivation even after the
   *  default is raised (e.g. from 100k to 600k). Optional for backwards
   *  compatibility — missing means legacy 100k. */
  iterations?: number;
}

// ── Settings ──────────────────────────────────────────────────────────────────

export interface DBSettings {
  key: string;
  value: string;
}

// ── Mileage ───────────────────────────────────────────────────────────────────

export interface DBMileageLog {
  id: string;
  date: string;
  description: string;
  distance: number;
  rate_applied: number;
  calculated_deduction: number;
  job_tag?: string | null;
  transaction_id: string;
  last_modified: number;
}

// ── Database class ────────────────────────────────────────────────────────────

class LedgerDB extends Dexie {
  transactions!:  Table<DBTransaction>;
  splits!:        Table<DBSplit>;
  attachments!:   Table<DBAttachment>;
  accounts!:      Table<DBAccount>;
  crypto_envelope!: Table<DBCryptoEnvelope>;
  settings!:      Table<DBSettings>;
  mileage_logs!:  Table<DBMileageLog>;

  constructor() {
    super('LedgerDB');

    // v1 — original schema (embedded splits, name-keyed accounts)
    this.version(1).stores({
      transactions:
        'id, date, description, job_tag, pending_review, last_modified, [job_tag+date], [category+date]',
      attachments:     'id, transaction_id',
      accounts:        'name, type, parent, sort_order',
      period_locks:    'id, start_date, end_date',
      settings:        'key',
      mileage_logs:    'id, date, last_modified',
      credit_purchases: 'id, date, created_at', // kept in schema history for upgrade path
    });

    // v2 — drop dead [category+date] index
    this.version(2).stores({
      transactions:
        'id, date, description, job_tag, pending_review, last_modified, [job_tag+date]',
    });

    // v3 — separate splits table, id-keyed accounts, crypto_envelope, drop period_locks
    this.version(3)
      .stores({
        transactions:
          'id, date, job_tag, pending_review, is_locked, last_modified, [job_tag+date], [date+is_locked]',
        splits:          'id, transaction_id, account_id',
        accounts:        'id, type, parent',
        crypto_envelope: 'id',
        period_locks:    null, // dropped — is_locked lives on the transaction
        mileage_logs:    'id, date, job_tag, transaction_id',
        credit_purchases: 'id, date, created_at',
      })
      .upgrade(async (tx) => {
        // Give every account an id equal to its existing name path
        await tx.table('accounts').toCollection().modify((acct) => {
          if (!acct.id) acct.id = acct.name;
          if (acct.type) acct.type = (acct.type as string).toUpperCase();
        });

        // Migrate embedded splits to the new splits table
        const legacyTxns = await tx.table('transactions').toArray();
        const newSplits: DBSplit[] = [];
        for (const txn of legacyTxns) {
          if (Array.isArray(txn.splits)) {
            for (const s of txn.splits) {
              newSplits.push({
                id:             uuidv4(),
                transaction_id: txn.id,
                account_id:     s.account ?? s.account_id ?? '',
                amount:         s.is_debit !== undefined
                  ? (s.is_debit ? Math.abs(s.amount) : -Math.abs(s.amount))
                  : s.amount,
                memo: s.memo ?? null,
              });
            }
            delete txn.splits;
          }
          if (txn.is_locked === undefined) txn.is_locked = false;
          await tx.table('transactions').put(txn);
        }
        if (newSplits.length) {
          await tx.table('splits').bulkAdd(newSplits);
        }

        // Migrate vault from settings keys to crypto_envelope table
        const saltRow = await tx.table('settings').get('vault_salt');
        const ivRow   = await tx.table('settings').get('vault_iv');
        const mdkRow  = await tx.table('settings').get('vault_encrypted_mdk');
        if (saltRow && ivRow && mdkRow) {
          await tx.table('crypto_envelope').put({
            id:            'master_mdk_envelope',
            salt:          saltRow.value,
            iv:            ivRow.value,
            encrypted_mdk: mdkRow.value,
          });
          await tx.table('settings').delete('vault_salt');
          await tx.table('settings').delete('vault_iv');
          await tx.table('settings').delete('vault_encrypted_mdk');
        }
      });

    // v4 — drop credit_purchases table (credits system removed)
    this.version(4).stores({
      credit_purchases: null,
    });
  }
}

export const db = new LedgerDB();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Eagerly loads splits for an array of transactions */
export async function loadWithSplits(txns: DBTransaction[]): Promise<TransactionWithSplits[]> {
  if (txns.length === 0) return [];
  const ids    = txns.map((t) => t.id);
  const splits = await db.splits.where('transaction_id').anyOf(ids).toArray();
  const byTxn  = new Map<string, DBSplit[]>();
  for (const s of splits) {
    const arr = byTxn.get(s.transaction_id) ?? [];
    arr.push(s);
    byTxn.set(s.transaction_id, arr);
  }
  // Decrypt at-rest fields (description + split amounts). Legacy plaintext rows
  // pass through unchanged, so existing data keeps working.
  return Promise.all(txns.map(async (t) => ({
    ...t,
    description: await decField(t.description),
    splits: await Promise.all(
      (byTxn.get(t.id) ?? []).map(async (s) => ({
        ...s,
        amount: s.amount_enc ? await decAmount(s.amount_enc, s.amount) : s.amount,
      })),
    ),
  })));
}

/** Requests durable storage allocation from the browser and opens the DB */
export async function initializeStoragePersistence(): Promise<boolean> {
  const granted =
    navigator.storage && navigator.storage.persist
      ? await navigator.storage.persist()
      : false;
  await db.open();
  return granted;
}

export async function requestStoragePersistence(): Promise<boolean> {
  return initializeStoragePersistence();
}

export async function initDB(): Promise<void> {
  await initializeStoragePersistence();
}
