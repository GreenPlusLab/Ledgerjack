// FIX #3 — backup import now validates schema before touching the database.
//
// Previously importBackup() did JSON.parse() → cast to BackupEnvelope → bulkAdd(as any[]).
// The SHA-256 checksum only guards against accidental corruption, not a crafted file:
// a malicious backup could replace the crypto_envelope with an attacker-controlled one,
// effectively rotating the vault password without knowing the current one.
//
// Changes:
//  1. Version check — rejects backups from unknown future versions.
//  2. Structural validation — checks required fields on every record type.
//  3. crypto_envelope guard — only allows exactly one entry with id='master_mdk_envelope'.
//  4. Typed bulkAdd calls — no more `as any[]`.

import { db } from './db';
import { sha256 } from './crypto';
import type {
  DBTransaction,
  DBSplit,
  DBAttachment,
  DBAccount,
  DBCryptoEnvelope,
  DBSettings,
  DBMileageLog,
} from './db';

export interface BackupEnvelope {
  checksum:    string;
  version:     number;
  exported_at: number;
  data: {
    transactions:    unknown[];
    splits:          unknown[];
    attachments:     unknown[];
    accounts:        unknown[];
    crypto_envelope: unknown[];
    settings:        unknown[];
    mileage_logs:    unknown[];
  };
}

// ── Validators ────────────────────────────────────────────────────────────────

const SUPPORTED_VERSIONS = [1, 2] as const;

function assertString(v: unknown, label: string): string {
  if (typeof v !== 'string') throw new Error(`Backup validation failed: ${label} must be a string`);
  return v;
}
function assertNumber(v: unknown, label: string): number {
  if (typeof v !== 'number') throw new Error(`Backup validation failed: ${label} must be a number`);
  return v;
}
function assertBoolean(v: unknown, label: string): boolean {
  if (typeof v !== 'boolean') throw new Error(`Backup validation failed: ${label} must be a boolean`);
  return v;
}
function assertRecord(v: unknown, label: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v))
    throw new Error(`Backup validation failed: ${label} must be an object`);
  return v as Record<string, unknown>;
}

function validateTransaction(raw: unknown, idx: number): DBTransaction {
  const r = assertRecord(raw, `transactions[${idx}]`);
  return {
    id:             assertString(r.id,          `transactions[${idx}].id`),
    date:           assertString(r.date,        `transactions[${idx}].date`),
    description:    assertString(r.description, `transactions[${idx}].description`),
    job_tag:        r.job_tag   != null ? assertString(r.job_tag,   `transactions[${idx}].job_tag`)   : undefined,
    attachment_id:  r.attachment_id != null ? assertString(r.attachment_id, `transactions[${idx}].attachment_id`) : undefined,
    // Kept on restore (these were previously dropped when a backup was restored).
    trade:          r.trade != null ? assertString(r.trade, `transactions[${idx}].trade`) : undefined,
    flag_accountant: r.flag_accountant != null ? assertBoolean(r.flag_accountant, `transactions[${idx}].flag_accountant`) : undefined,
    review_flags:   Array.isArray(r.review_flags) ? r.review_flags.filter((f): f is string => typeof f === 'string') : undefined,
    pending_review: assertBoolean(r.pending_review, `transactions[${idx}].pending_review`),
    is_locked:      assertBoolean(r.is_locked,      `transactions[${idx}].is_locked`),
    last_modified:  assertNumber(r.last_modified,   `transactions[${idx}].last_modified`),
  };
}

function validateSplit(raw: unknown, idx: number): DBSplit {
  const r = assertRecord(raw, `splits[${idx}]`);
  return {
    id:             assertString(r.id,             `splits[${idx}].id`),
    transaction_id: assertString(r.transaction_id, `splits[${idx}].transaction_id`),
    account_id:     assertString(r.account_id,     `splits[${idx}].account_id`),
    amount:         assertNumber(r.amount,         `splits[${idx}].amount`),
    amount_enc:     r.amount_enc != null ? assertString(r.amount_enc, `splits[${idx}].amount_enc`) : undefined,
    memo:           r.memo != null ? assertString(r.memo, `splits[${idx}].memo`) : null,
  };
}

function validateAccount(raw: unknown, idx: number): DBAccount {
  const r = assertRecord(raw, `accounts[${idx}]`);
  const VALID_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'] as const;
  const type = assertString(r.type, `accounts[${idx}].type`);
  if (!VALID_TYPES.includes(type as typeof VALID_TYPES[number]))
    throw new Error(`Backup validation failed: accounts[${idx}].type "${type}" is not a valid account type`);
  return {
    id:          assertString(r.id,       `accounts[${idx}].id`),
    name:        assertString(r.name,     `accounts[${idx}].name`),
    type:        type as DBAccount['type'],
    parent:      r.parent != null ? assertString(r.parent, `accounts[${idx}].parent`) : undefined,
    placeholder: assertBoolean(r.placeholder, `accounts[${idx}].placeholder`),
    sort_order:  assertNumber(r.sort_order,  `accounts[${idx}].sort_order`),
  };
}

function validateCryptoEnvelope(raw: unknown, idx: number): DBCryptoEnvelope {
  const r = assertRecord(raw, `crypto_envelope[${idx}]`);
  const id = assertString(r.id, `crypto_envelope[${idx}].id`);

  // FIX #3 — only the canonical envelope ID is allowed; reject any other value
  if (id !== 'master_mdk_envelope')
    throw new Error(`Backup validation failed: crypto_envelope[${idx}].id must be "master_mdk_envelope", got "${id}"`);

  return {
    id:            'master_mdk_envelope',
    salt:          assertString(r.salt,          `crypto_envelope[${idx}].salt`),
    iv:            assertString(r.iv,            `crypto_envelope[${idx}].iv`),
    encrypted_mdk: assertString(r.encrypted_mdk, `crypto_envelope[${idx}].encrypted_mdk`),
  };
}

function validateSetting(raw: unknown, idx: number): DBSettings {
  const r = assertRecord(raw, `settings[${idx}]`);
  return {
    key:   assertString(r.key,   `settings[${idx}].key`),
    value: assertString(r.value, `settings[${idx}].value`),
  };
}

function validateMileageLog(raw: unknown, idx: number): DBMileageLog {
  const r = assertRecord(raw, `mileage_logs[${idx}]`);
  return {
    id:                   assertString(r.id,          `mileage_logs[${idx}].id`),
    date:                 assertString(r.date,        `mileage_logs[${idx}].date`),
    description:          assertString(r.description, `mileage_logs[${idx}].description`),
    distance:             assertNumber(r.distance,    `mileage_logs[${idx}].distance`),
    rate_applied:         assertNumber(r.rate_applied,         `mileage_logs[${idx}].rate_applied`),
    calculated_deduction: assertNumber(r.calculated_deduction, `mileage_logs[${idx}].calculated_deduction`),
    job_tag:              r.job_tag != null ? assertString(r.job_tag, `mileage_logs[${idx}].job_tag`) : null,
    transaction_id:       assertString(r.transaction_id, `mileage_logs[${idx}].transaction_id`),
    last_modified:        assertNumber(r.last_modified,  `mileage_logs[${idx}].last_modified`),
  };
}

// Attachments contain Uint8Array fields that are serialised as plain objects by JSON.stringify.
// We accept them loosely here (the data is already encrypted) but do check the required fields.
function validateAttachment(raw: unknown, idx: number): DBAttachment {
  const r = assertRecord(raw, `attachments[${idx}]`);
  // encrypted_iv and encrypted_data come back as {0:n, 1:n, ...} — convert to Uint8Array
  function toUint8(field: unknown, label: string): Uint8Array {
    if (field instanceof Uint8Array) return field;
    if (typeof field === 'object' && field !== null) {
      return new Uint8Array(Object.values(field as Record<string, number>));
    }
    throw new Error(`Backup validation failed: ${label} must be a Uint8Array or serialised object`);
  }
  return {
    id:             assertString(r.id,             `attachments[${idx}].id`),
    transaction_id: assertString(r.transaction_id, `attachments[${idx}].transaction_id`),
    encrypted_iv:   toUint8(r.encrypted_iv,   `attachments[${idx}].encrypted_iv`),
    encrypted_data: toUint8(r.encrypted_data, `attachments[${idx}].encrypted_data`),
    mime_type:      assertString(r.mime_type,  `attachments[${idx}].mime_type`),
    created_at:     assertNumber(r.created_at, `attachments[${idx}].created_at`),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function exportBackup(): Promise<string> {
  const data = {
    transactions:    await db.transactions.toArray(),
    splits:          await db.splits.toArray(),
    attachments:     await db.attachments.toArray(),
    accounts:        await db.accounts.toArray(),
    crypto_envelope: await db.crypto_envelope.toArray(),
    settings:        await db.settings.toArray(),
    mileage_logs:    await db.mileage_logs.toArray(),
  };

  const dataJson = JSON.stringify(data);
  const checksum = await sha256(new TextEncoder().encode(dataJson));

  const envelope: BackupEnvelope = { checksum, version: 2, exported_at: Date.now(), data };

  // The caller decides whether this counts as a backup (updateBackupTimestamp).
  // A partly locked copy left on the same device does not.

  return JSON.stringify(envelope);
}

export async function importBackup(json: string): Promise<void> {
  // 1. Parse outer envelope
  let envelope: BackupEnvelope;
  try {
    envelope = JSON.parse(json) as BackupEnvelope;
  } catch {
    throw new Error('Backup file is not valid JSON.');
  }

  // FIX #3a — version check
  if (!SUPPORTED_VERSIONS.includes(envelope.version as typeof SUPPORTED_VERSIONS[number])) {
    throw new Error(
      `Backup version ${envelope.version} is not supported by this version of LedgerJack. ` +
      `Supported versions: ${SUPPORTED_VERSIONS.join(', ')}.`,
    );
  }

  // 2. Verify checksum (guards against accidental corruption)
  const dataJson          = JSON.stringify(envelope.data);
  const computedChecksum  = await sha256(new TextEncoder().encode(dataJson));
  if (computedChecksum !== envelope.checksum) {
    throw new Error('Backup checksum verification failed. File may be corrupted or tampered with.');
  }

  // FIX #3b — structural validation before any DB writes
  const d = envelope.data;

  if (!Array.isArray(d.transactions))    throw new Error('Backup validation failed: data.transactions must be an array');
  if (!Array.isArray(d.splits))          throw new Error('Backup validation failed: data.splits must be an array');
  if (!Array.isArray(d.attachments))     throw new Error('Backup validation failed: data.attachments must be an array');
  if (!Array.isArray(d.accounts))        throw new Error('Backup validation failed: data.accounts must be an array');
  if (!Array.isArray(d.crypto_envelope)) throw new Error('Backup validation failed: data.crypto_envelope must be an array');
  if (!Array.isArray(d.settings))        throw new Error('Backup validation failed: data.settings must be an array');
  if (!Array.isArray(d.mileage_logs))    throw new Error('Backup validation failed: data.mileage_logs must be an array');
  // Note: older backups may include a `credit_purchases` array from a removed
  // feature. It's ignored on import (not required, not restored).

  // FIX #3c — crypto_envelope: only one entry allowed and it must have the canonical ID
  if (d.crypto_envelope.length > 1) {
    throw new Error('Backup validation failed: data.crypto_envelope must contain at most one entry');
  }

  const validatedTransactions   = d.transactions.map(validateTransaction);
  const validatedSplits         = d.splits.map(validateSplit);
  const validatedAttachments    = d.attachments.map(validateAttachment);
  const validatedAccounts       = d.accounts.map(validateAccount);
  const validatedEnvelope       = d.crypto_envelope.map(validateCryptoEnvelope);
  const validatedSettings       = d.settings.map(validateSetting);
  const validatedMileageLogs    = d.mileage_logs.map(validateMileageLog);

  // 3. All validation passed — write to DB atomically
  await db.transaction(
    'rw',
    [
      db.transactions, db.splits, db.attachments, db.accounts,
      db.crypto_envelope, db.settings, db.mileage_logs,
    ],
    async () => {
      for (const table of [
        db.mileage_logs, db.crypto_envelope,
        db.accounts, db.attachments, db.splits, db.transactions,
      ]) {
        await table.clear();
      }

      if (validatedTransactions.length)    await db.transactions.bulkAdd(validatedTransactions);
      if (validatedSplits.length)          await db.splits.bulkAdd(validatedSplits);
      if (validatedAttachments.length)     await db.attachments.bulkAdd(validatedAttachments);
      if (validatedAccounts.length)        await db.accounts.bulkAdd(validatedAccounts);
      if (validatedEnvelope.length)        await db.crypto_envelope.bulkAdd(validatedEnvelope);
      if (validatedSettings.length)        await db.settings.bulkAdd(validatedSettings);
      if (validatedMileageLogs.length)     await db.mileage_logs.bulkAdd(validatedMileageLogs);
    },
  );
}

export async function getLastBackupTimestamp(): Promise<number | null> {
  const setting = await db.settings.get('last_backup_timestamp');
  return setting ? parseInt(setting.value, 10) : null;
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader   = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
