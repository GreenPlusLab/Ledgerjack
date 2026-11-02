/**
 * destinations — where an ENCRYPTED backup goes.
 *
 *  - device   : download the encrypted backup file, then keep a copy off this
 *               device yourself — your cloud drive, email, USB. Works everywhere,
 *               no backend, no third-party account.
 *  - webdav   : upload straight to your own Nextcloud/WebDAV server. Works when
 *               the server allows browser (CORS) requests; we surface a clear
 *               error if it doesn't.
 *  - server   : LedgerJack's own encrypted server — flagged "coming soon".
 *
 * DESIGN DECISION (deliberate): there are no Google Drive / Dropbox / iCloud
 * integrations, and there won't be. Every phone and laptop already has a
 * "Share"/"Save to Files" sheet that reaches all of them — plus email and USB,
 * which no OAuth integration covers. Building it would mean client IDs, brand
 * verification, refresh tokens sitting in browser storage, and a dependency that
 * breaks silently whenever a provider changes policy — all to do a worse job of
 * what the operating system already does. We don't connect to anyone's cloud
 * account, so we can't leak one. Saving the copy is the user's job; reminding
 * them is ours.
 *
 * The backup passphrase and any WebDAV password are stored ENCRYPTED on-device
 * (via the vault), never in the clear, so scheduled backups can run without
 * re-prompting while the cloud only ever sees ciphertext.
 */

import { recordLeft } from "../privacy/store";
import { db } from "../db";
import { encryptTextPayload, decryptTextPayload } from "../crypto";
import { downloadFile } from "../backup";
import { exportEncryptedBackup } from "./encryptedBackup";

export type DestinationKind = "device" | "webdav" | "server";

export interface BackupDestination {
  kind: DestinationKind;
  webdavUrl?: string;
  webdavUser?: string;
}

const DEST_KEY = "backup_destination";
const SECRET_KEY = "backup_secrets_enc"; // { ciphertext, iv } of JSON { passphrase, webdavPassword }

export const NEEDS_BACKEND: DestinationKind[] = ["server"];

export async function loadDestination(): Promise<BackupDestination | null> {
  const row = await db.settings.get(DEST_KEY);
  if (!row?.value) return null;
  try { return JSON.parse(row.value) as BackupDestination; } catch { return null; }
}
export async function saveDestination(dest: BackupDestination): Promise<void> {
  await db.settings.put({ key: DEST_KEY, value: JSON.stringify(dest) });
}
export async function isBackupConfigured(): Promise<boolean> {
  return (await loadDestination()) !== null;
}

interface Secrets { passphrase: string; webdavPassword?: string }

export async function saveBackupSecrets(s: Secrets): Promise<void> {
  const enc = await encryptTextPayload(JSON.stringify(s));
  await db.settings.put({ key: SECRET_KEY, value: JSON.stringify(enc) });
}
export async function loadBackupSecrets(): Promise<Secrets | null> {
  const row = await db.settings.get(SECRET_KEY);
  if (!row?.value) return null;
  try {
    const { ciphertext, iv } = JSON.parse(row.value);
    return JSON.parse(await decryptTextPayload(ciphertext, iv)) as Secrets;
  } catch {
    return null;
  }
}

function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

/** Upload an encrypted blob to a WebDAV server (basic auth). */
async function putWebdav(dest: BackupDestination, user: string, password: string, blob: string): Promise<void> {
  if (!dest.webdavUrl) throw new Error("WebDAV URL is missing.");
  const base = dest.webdavUrl.replace(/\/+$/, "");
  const url = `${base}/ledgerjack-backup-${stamp()}.ljbackup`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: "Basic " + btoa(`${user}:${password}`),
        "Content-Type": "application/octet-stream",
      },
      body: blob,
    });
  } catch {
    throw new Error("Couldn't reach your WebDAV server from the browser. Many servers block browser (CORS) uploads — if so, use the encrypted file option and upload it to your cloud yourself.");
  }
  if (!res.ok) throw new Error(`WebDAV upload failed (status ${res.status}). Check the URL and credentials.`);
}

/**
 * Run a backup to the configured destination using stored secrets.
 * Returns a short human message describing what happened.
 */
export async function runBackup(): Promise<string> {
  const dest = await loadDestination();
  if (!dest) throw new Error("Choose a backup destination first.");
  const secrets = await loadBackupSecrets();
  if (!secrets?.passphrase) throw new Error("Backup passphrase isn't set.");

  if (NEEDS_BACKEND.includes(dest.kind)) {
    throw new Error("This provider needs the LedgerJack backend (coming soon). For now use the encrypted file, or WebDAV.");
  }

  const blob = await exportEncryptedBackup(secrets.passphrase);

  if (dest.kind === "device") {
    downloadFile(blob, `ledgerjack-backup-${stamp()}.ljbackup`, "application/json");
    void recordLeft("backup", "a file on this device", true);
    return "Encrypted backup downloaded. Save it to your cloud drive or a safe place.";
  }
  if (dest.kind === "webdav") {
    await putWebdav(dest, dest.webdavUser ?? "", secrets.webdavPassword ?? "", blob);
    void recordLeft("backup", "your own server (WebDAV)", true);
    return "Encrypted backup uploaded to your WebDAV server.";
  }
  throw new Error("Unknown backup destination.");
}
