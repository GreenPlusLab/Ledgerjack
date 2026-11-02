import { useState, useRef, useCallback } from 'react';
import {
  Shield, Download, Upload, Trash2, FileText, Clock, Globe, Key, AlertTriangle, CheckCircle2, LifeBuoy, BarChart2, Briefcase, FolderOpen, BookOpen, Car, Calculator, PiggyBank, Activity,
} from 'lucide-react';
import TipJar from '../components/TipJar';
import AISettingsPanel from '../components/AISettingsPanel';
import AIModelInfo from '../components/AIModelInfo';
import AICostCard from '../components/AICostCard';
import type { View } from '../components/Navigation';
import { useApp } from '../contexts/AppContext';
import { useCrypto } from '../contexts/CryptoContext';
import { TAX_REGIONS, getFlagEmoji, type TaxRegion } from '../lib/regions';
import { exportBackup, importBackup, downloadFile, readFileAsText } from '../lib/backup';
import { parseCSV, csvRowToPendingTransaction, type CSVRow } from '../lib/csv';
import { decField } from '../lib/atRest';
import DeadlineCalendarCard from '../components/DeadlineCalendarCard';
import DemoDataCard from '../components/DemoDataCard';
import IsThisForYouCard from '../components/IsThisForYouCard';
import { createTransaction } from '../lib/ledger';
import { loadRules } from '../lib/rules/rules';
import { db } from '../lib/db';
import BiometricSetup from '../components/BiometricSetup';
import { APP_MOTTO } from '../lib/brand';
import { recordLeft } from '../lib/privacy/store';

interface DedupRow {
  row: CSVRow;
  isDuplicate: boolean;
  matchedDescription?: string;
}

async function detectDuplicates(rows: CSVRow[], _region: string): Promise<DedupRow[]> {
  const rawTxns = await db.transactions.toArray();
  // Descriptions are encrypted at rest — decrypt before comparing.
  const existingTxns = await Promise.all(
    rawTxns.map(async (tx) => ({ ...tx, description: await decField(tx.description) })),
  );
  const existingKeys = new Set(
    existingTxns.map((tx) => `${tx.date}|${tx.description.toLowerCase().trim()}`)
  );

  return rows.map((row) => {
    const key = `${row.date}|${row.description.toLowerCase().trim()}`;
    const isDuplicate = existingKeys.has(key);
    const match = isDuplicate
      ? existingTxns.find(
          (tx) =>
            tx.date === row.date &&
            tx.description.toLowerCase().trim() === row.description.toLowerCase().trim()
        )
      : undefined;
    return { row, isDuplicate, matchedDescription: match?.description };
  });
}

export default function Settings({ onNavigate }: { onNavigate?: (view: View) => void }) {
  const {
    region, setRegion,
    exportAuditLog, toggleExportAuditLog,
    exportAuditEntries, addExportAuditEntry, updateBackupTimestamp,
  } = useApp();
  const { changePassword, initializeVault, hasVault, verifyPassword } = useCrypto();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');
  const [setupMsg, setSetupMsg] = useState('');
  const [setupRecoveryKey, setSetupRecoveryKey] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);
  const [exportMsg, setExportMsg] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [showConfirmPurge, setShowConfirmPurge] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [regionUnlocked, setRegionUnlocked] = useState(false);
  const [regionPassword, setRegionPassword] = useState('');
  const [regionError, setRegionError] = useState('');

  // CSV drag-and-drop + dedup state
  const [csvDragOver, setCsvDragOver] = useState(false);
  const [csvRows, setCsvRows] = useState<DedupRow[]>([]);
  const [csvFileName, setCsvFileName] = useState('');
  const [csvMsg, setCsvMsg] = useState('');
  const [csvImporting, setCsvImporting] = useState(false);
  const [importSkipDupes, setImportSkipDupes] = useState(true);

  const backupInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const handleChangePassword = async () => {
    setPasswordMsg('');
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setPasswordMsg('Password changed successfully.');
    } catch {
      setPasswordMsg('Failed to change password. Check current password.');
    }
  };

  const handleSetupVault = async () => {
    if (setupPassword.length < 8) { setSetupMsg('Password must be at least 8 characters.'); return; }
    if (setupPassword !== setupConfirm) { setSetupMsg('Passwords do not match.'); return; }
    setSetupMsg('');
    setSetupLoading(true);
    try {
      const key = await initializeVault(setupPassword);
      setSetupRecoveryKey(key);
      setSetupPassword('');
      setSetupConfirm('');
    } catch {
      setSetupMsg('Failed to create vault. Please try again.');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleExportBackup = async () => {
    try {
      const json = await exportBackup();
      downloadFile(json, `ledgerjack-backup-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
      void recordLeft('export', 'a file on this device', false);
      updateBackupTimestamp();
      addExportAuditEntry('backup');
      setExportMsg('Backup saved. Keep a copy off this device too — see Backup & security.');
      setTimeout(() => setExportMsg(''), 3000);
    } catch {
      setExportMsg('Export failed.');
    }
  };

  const handleImportBackup = async (file: File) => {
    try {
      const json = await readFileAsText(file);
      await importBackup(json);
      setImportMsg('Backup imported successfully. Refresh the app to see changes.');
      setTimeout(() => setImportMsg(''), 5000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Import failed.';
      setImportMsg(msg);
    }
  };

  const loadCSVFile = useCallback(async (file: File) => {
    setCsvMsg('');
    setCsvRows([]);
    setCsvFileName(file.name);
    try {
      const rows = await parseCSV(file);
      const valid = rows.filter((r) => r.date && r.amount);
      const deduped = await detectDuplicates(valid, region);
      setCsvRows(deduped);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to parse CSV.';
      setCsvMsg(msg);
    }
  }, [region]);

  const handleCSVDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setCsvDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.txt'))) {
      loadCSVFile(file);
    }
  }, [loadCSVFile]);

  const handleCSVCommit = async () => {
    if (!csvRows.length) return;
    setCsvImporting(true);
    try {
      const toImport = importSkipDupes ? csvRows.filter((r) => !r.isDuplicate) : csvRows;
      const rules = await loadRules();
      let count = 0;
      for (const { row } of toImport) {
        if (!row.date || !row.amount) continue;
        const { txFields, splits } = csvRowToPendingTransaction(row, region, rules);
        await createTransaction(txFields, splits);
        count++;
      }
      addExportAuditEntry('csv-import');
      setCsvMsg(`${count} transaction${count !== 1 ? 's' : ''} imported to Pending Review.${
        importSkipDupes && csvRows.some((r) => r.isDuplicate)
          ? ` (${csvRows.filter((r) => r.isDuplicate).length} duplicates skipped)`
          : ''
      }`);
      setCsvRows([]);
      setCsvFileName('');
      setTimeout(() => setCsvMsg(''), 6000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Import failed.';
      setCsvMsg(msg);
    } finally {
      setCsvImporting(false);
    }
  };

  const handleDeleteAllData = async () => {
    setDeleteError('');
    if (!deletePassword) { setDeleteError('Enter your password to confirm.'); return; }
    const ok = await verifyPassword(deletePassword);
    if (!ok) { setDeleteError('Incorrect password. Data was not deleted.'); return; }
    await db.delete();
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  };

  const dupeCount = csvRows.filter((r) => r.isDuplicate).length;
  const newCount = csvRows.filter((r) => !r.isDuplicate).length;

  return (
    <div className="space-y-4 pb-24">
      <h2 className="text-lg font-bold text-slate-900">Settings</h2>

      {/* Making Tax Digital — UK only. Opens the MTD hub. */}
      {region === 'uk' && (
        <button
          onClick={() => onNavigate?.('mtd')}
          className="w-full bg-white rounded-xl border border-line p-4 flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-brand-600" />
            <div>
              <h3 className="font-bold text-slate-900">Making Tax Digital</h3>
              <p className="text-xs text-slate-500">Connect to HMRC and file your quarterly updates</p>
            </div>
          </div>
          <span className="text-ink-soft text-xl leading-none">›</span>
        </button>
      )}

      {/* Security */}
      <div className="bg-white rounded-xl border border-line p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-brand-600" />
          <h3 className="font-bold text-slate-900">Security</h3>
        </div>

        <BiometricSetup />

        {!hasVault && !setupRecoveryKey && (
          <>
            <p className="text-xs text-slate-500 font-medium">
              Encryption is not enabled. Set a vault password to protect your data with AES-256-GCM — your password never leaves this device.
            </p>
            <input
              type="password"
              value={setupPassword}
              onChange={(e) => { setSetupPassword(e.target.value); setSetupMsg(''); }}
              placeholder="New password (min 8 characters)"
              className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm text-slate-900 font-medium outline-none focus:border-brand-400"
            />
            <input
              type="password"
              value={setupConfirm}
              onChange={(e) => { setSetupConfirm(e.target.value); setSetupMsg(''); }}
              placeholder="Confirm password"
              className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm text-slate-900 font-medium outline-none focus:border-brand-400"
            />
            {setupMsg && <p className="text-sm text-red-600 font-medium">{setupMsg}</p>}
            <button
              onClick={handleSetupVault}
              disabled={setupLoading || !setupPassword || !setupConfirm}
              className="w-full bg-brand-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <Key className="w-4 h-4" />
              {setupLoading ? 'Creating Vault…' : 'Enable Encryption'}
            </button>
          </>
        )}

        {!hasVault && setupRecoveryKey && (
          <>
            <p className="text-xs text-brand-700 font-semibold bg-brand-50 border border-brand-200 rounded-lg px-3 py-2">
              Vault created! Save your recovery key — there is no server reset. Lose this and forget your password and your data is gone permanently.
            </p>
            <div className="bg-slate-900 rounded-xl p-3 border border-slate-700 text-brand-400 font-mono text-[11px] break-all select-all leading-relaxed">
              {setupRecoveryKey}
            </div>
            <button
              onClick={() => {
                downloadFile(
                  JSON.stringify({ recovery_key: setupRecoveryKey, created: new Date().toISOString() }, null, 2),
                  `ledgerjack-recovery-key-${new Date().toISOString().split('T')[0]}.json`,
                  'application/json',
                );
              }}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" /> Download Recovery Key File
            </button>
          </>
        )}

        {hasVault && (
          <>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm text-slate-900 font-medium"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm text-slate-900 font-medium"
            />
            <button
              onClick={handleChangePassword}
              disabled={!currentPassword || !newPassword}
              className="w-full bg-slate-800 text-white py-2 rounded-lg text-sm font-bold hover:bg-slate-900 disabled:opacity-50"
            >
              Change Password
            </button>
            {passwordMsg && <p className="text-sm text-brand-600 font-medium">{passwordMsg}</p>}
          </>
        )}
      </div>

      <DemoDataCard />

      <DeadlineCalendarCard />

      <button
        onClick={() => onNavigate?.('provisional')}
        className="w-full bg-white rounded-xl border border-line p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-brand-600" />
          <div>
            <h3 className="font-bold text-slate-900">Your provisional figures</h3>
            <p className="text-xs text-slate-500">Your tax-year totals, and HMRC's own calculator</p>
          </div>
        </div>
        <span className="text-ink-soft text-xl leading-none">›</span>
      </button>

      <button
        onClick={() => onNavigate?.('health')}
        className="w-full bg-white rounded-xl border border-line p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-brand-600" />
          <div>
            <h3 className="font-bold text-slate-900">Health check</h3>
            <p className="text-xs text-slate-500">Check your records for problems</p>
          </div>
        </div>
        <span className="text-ink-soft text-xl leading-none">›</span>
      </button>

      <button
        onClick={() => onNavigate?.('report')}
        className="w-full bg-white rounded-xl border border-line p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <LifeBuoy className="w-5 h-5 text-brand-600" />
          <div>
            <h3 className="font-bold text-slate-900">Report a problem</h3>
            <p className="text-xs text-slate-500">Tell us what's wrong — nothing leaves your device unless you share it</p>
          </div>
        </div>
        <span className="text-ink-soft text-xl leading-none">›</span>
      </button>

      <button
        onClick={() => onNavigate?.('tax-pot')}
        className="w-full bg-white rounded-xl border border-line p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <PiggyBank className="w-5 h-5 text-brand-600" />
          <div>
            <h3 className="font-bold text-slate-900">Tax pot (estimate)</h3>
            <p className="text-xs text-slate-500">A rough guide to what to set aside</p>
          </div>
        </div>
        <span className="text-ink-soft text-xl leading-none">›</span>
      </button>

      <button
        onClick={() => onNavigate?.('job-estimator')}
        className="w-full bg-white rounded-xl border border-line p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-brand-600" />
          <div>
            <h3 className="font-bold text-slate-900">Job estimator</h3>
            <p className="text-xs text-slate-500">Cost a job &amp; work out what to quote</p>
          </div>
        </div>
        <span className="text-ink-soft text-xl leading-none">›</span>
      </button>

      <button
        onClick={() => onNavigate?.('mileage')}
        className="w-full bg-white rounded-xl border border-line p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Car className="w-5 h-5 text-brand-600" />
          <div>
            <h3 className="font-bold text-slate-900">Mileage</h3>
            <p className="text-xs text-slate-500">Log business trips &amp; mileage deductions</p>
          </div>
        </div>
        <span className="text-ink-soft text-xl leading-none">›</span>
      </button>

      <button
        onClick={() => onNavigate?.('manual')}
        className="w-full bg-white rounded-xl border border-line p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-brand-600" />
          <div>
            <h3 className="font-bold text-slate-900">Manual &amp; FAQ</h3>
            <p className="text-xs text-slate-500">How to use LedgerJack &amp; common questions</p>
          </div>
        </div>
        <span className="text-ink-soft text-xl leading-none">›</span>
      </button>

      <button
        onClick={() => onNavigate?.('file-cabinet')}
        className="w-full bg-white rounded-xl border border-line p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-brand-600" />
          <div>
            <h3 className="font-bold text-slate-900">File Cabinet</h3>
            <p className="text-xs text-slate-500">Browse, search &amp; back up your receipts</p>
          </div>
        </div>
        <span className="text-ink-soft text-xl leading-none">›</span>
      </button>

      <button
        onClick={() => onNavigate?.('statements')}
        className="w-full bg-white rounded-xl border border-line p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-brand-600" />
          <div>
            <h3 className="font-bold text-slate-900">Provisional statements</h3>
            <p className="text-xs text-slate-500">P&amp;L, balance sheet, SA103 &amp; export for your accountant</p>
          </div>
        </div>
        <span className="text-ink-soft text-xl leading-none">›</span>
      </button>

      <button
        onClick={() => onNavigate?.('rules')}
        className="w-full bg-white rounded-xl border border-line p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-brand-600" />
          <div>
            <h3 className="font-bold text-slate-900">Categorisation rules</h3>
            <p className="text-xs text-slate-500">Auto-file transactions by description — no AI needed</p>
          </div>
        </div>
        <span className="text-ink-soft text-xl leading-none">›</span>
      </button>

      <button
        onClick={() => onNavigate?.('recurring')}
        className="w-full bg-white rounded-xl border border-line p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-brand-600" />
          <div>
            <h3 className="font-bold text-slate-900">Recurring transactions</h3>
            <p className="text-xs text-slate-500">Auto-create rent, subscriptions and other regular items</p>
          </div>
        </div>
        <span className="text-ink-soft text-xl leading-none">›</span>
      </button>

      <button
        onClick={() => onNavigate?.('budgets')}
        className="w-full bg-white rounded-xl border border-line p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-brand-600" />
          <div>
            <h3 className="font-bold text-slate-900">Budgets</h3>
            <p className="text-xs text-slate-500">Set spending targets and track them</p>
          </div>
        </div>
        <span className="text-ink-soft text-xl leading-none">›</span>
      </button>

      <button
        onClick={() => onNavigate?.('trades')}
        className="w-full bg-white rounded-xl border border-line p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-brand-600" />
          <div>
            <h3 className="font-bold text-slate-900">Trades &amp; income sources</h3>
            <p className="text-xs text-slate-500">Track more than one business, or a trade plus property</p>
          </div>
        </div>
        <span className="text-ink-soft text-xl leading-none">›</span>
      </button>

      {region === 'uk' && (
        <button
          onClick={() => onNavigate?.('vat')}
          className="w-full bg-white rounded-xl border border-line p-4 flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-brand-600" />
            <div>
              <h3 className="font-bold text-slate-900">VAT (Making Tax Digital)</h3>
              <p className="text-xs text-slate-500">File your 9-box VAT return to HMRC</p>
            </div>
          </div>
          <span className="text-ink-soft text-xl leading-none">›</span>
        </button>
      )}

      {region === 'uk' && (
        <button
          onClick={() => onNavigate?.('cis')}
          className="w-full bg-white rounded-xl border border-line p-4 flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-brand-600" />
            <div>
              <h3 className="font-bold text-slate-900">Subcontractors (CIS)</h3>
              <p className="text-xs text-slate-500">Record subcontractor payments and CIS deductions</p>
            </div>
          </div>
          <span className="text-ink-soft text-xl leading-none">›</span>
        </button>
      )}

      <button
        onClick={() => onNavigate?.('bank')}
        className="w-full bg-white rounded-xl border border-line p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Upload className="w-5 h-5 text-brand-600" />
          <div>
            <h3 className="font-bold text-slate-900">Bank &amp; reconciliation</h3>
            <p className="text-xs text-slate-500">Import a bank CSV and match it to your records</p>
          </div>
        </div>
        <span className="text-ink-soft text-xl leading-none">›</span>
      </button>

      <button
        onClick={() => onNavigate?.('cloud-backup')}
        className="w-full bg-white rounded-xl border border-line p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-brand-600" />
          <div>
            <h3 className="font-bold text-slate-900">Backup</h3>
            <p className="text-xs text-slate-500">Encrypted backup to a file, your cloud, or WebDAV</p>
          </div>
        </div>
        <span className="text-ink-soft text-xl leading-none">›</span>
      </button>

      <button
        onClick={() => onNavigate?.('accountant')}
        className="w-full bg-white rounded-xl border border-line p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-brand-600" />
          <div>
            <h3 className="font-bold text-slate-900">Your accountant</h3>
            <p className="text-xs text-slate-500">Flag items and send an accountant pack</p>
          </div>
        </div>
        <span className="text-ink-soft text-xl leading-none">›</span>
      </button>

      <button
        onClick={() => onNavigate?.('privacy')}
        className="w-full bg-white rounded-xl border-2 border-brand-300 p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-brand-600" />
          <div>
            <h3 className="font-bold text-slate-900">Your privacy choices</h3>
            <p className="text-xs text-slate-500">How receipts are read, where backups go, what left your phone</p>
          </div>
        </div>
        <span className="text-ink-soft text-xl leading-none">›</span>
      </button>

      <button
        onClick={() => onNavigate?.('trust')}
        className="w-full bg-white rounded-xl border border-line p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-brand-600" />
          <div>
            <h3 className="font-bold text-slate-900">Privacy &amp; trust</h3>
            <p className="text-xs text-slate-500">How your data is protected · export anytime</p>
          </div>
        </div>
        <span className="text-ink-soft text-xl leading-none">›</span>
      </button>

      <AISettingsPanel />

      <AIModelInfo />

      <AICostCard />

      <button
        onClick={() => onNavigate?.('support')}
        className="w-full bg-white rounded-xl border border-line p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <LifeBuoy className="w-5 h-5 text-brand-600" />
          <div>
            <h3 className="font-bold text-slate-900">Help &amp; support</h3>
            <p className="text-xs text-slate-500">Ask the AI assistant, or report a problem</p>
          </div>
        </div>
        <span className="text-ink-soft text-xl leading-none">›</span>
      </button>

      {/* Data Management */}
      <div className="bg-white rounded-xl border border-line p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-brand-600" />
          <h3 className="font-bold text-slate-900">Data Management</h3>
        </div>

        <button
          onClick={handleExportBackup}
          className="w-full bg-slate-100 border border-line text-slate-700 py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-200 flex items-center justify-center gap-1.5"
        >
          <Download className="w-4 h-4" /> Export Backup File
        </button>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800 leading-relaxed">
            <strong>This file is only partly protected.</strong> Your descriptions, amounts and receipts are encrypted inside it, but notes, category names and mileage logs are readable by anyone who opens it. It's fine on a device you control.{' '}
            <strong>For a copy you put in a cloud drive or email, use the passphrase-encrypted backup</strong> in Backup &amp; security instead — that one is unreadable without your passphrase.
          </p>
        </div>

        <button
          onClick={() => backupInputRef.current?.click()}
          className="w-full bg-slate-100 border border-line text-slate-700 py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-200 flex items-center justify-center gap-1.5"
        >
          <Upload className="w-4 h-4" /> Import Backup
        </button>
        <input
          ref={backupInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleImportBackup(e.target.files[0])}
        />

        {exportMsg && <p className="text-sm text-brand-600 font-medium">{exportMsg}</p>}
        {importMsg && <p className="text-sm text-brand-600 font-medium">{importMsg}</p>}
      </div>

      {/* CSV Bank Statement Importer */}
      <div className="bg-white rounded-xl border border-line p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-brand-600" />
          <h3 className="font-bold text-slate-900">Bank Statement Import</h3>
        </div>
        <p className="text-xs text-slate-500 font-medium leading-relaxed">
          Export a CSV from your bank and drop it here. Duplicate entries already in your ledger are automatically detected before import.
        </p>

        {/* Drag-and-drop zone */}
        {!csvRows.length && (
          <div
            onDragOver={(e) => { e.preventDefault(); setCsvDragOver(true); }}
            onDragLeave={() => setCsvDragOver(false)}
            onDrop={handleCSVDrop}
            onClick={() => csvInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
              csvDragOver
                ? 'border-brand-400 bg-brand-50'
                : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50'
            }`}
          >
            <Upload className={`w-8 h-8 mx-auto mb-2 ${csvDragOver ? 'text-brand-500' : 'text-slate-300'}`} />
            <p className="text-sm font-semibold text-slate-600">Drop CSV here or tap to browse</p>
            <p className="text-xs text-ink-soft mt-1">Supports .csv exports from any bank</p>
          </div>
        )}
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,.txt"
          className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) loadCSVFile(e.target.files[0]); }}
        />

        {/* Dedup preview panel */}
        {csvRows.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-700">{csvFileName}</p>
              <button
                onClick={() => { setCsvRows([]); setCsvFileName(''); }}
                className="text-xs text-ink-soft hover:text-slate-600 font-semibold"
              >
                Clear
              </button>
            </div>

            {/* Summary chips */}
            <div className="flex gap-2">
              <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-income" />
                <span className="text-xs font-bold text-emerald-700">{newCount} new</span>
              </div>
              {dupeCount > 0 && (
                <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span className="text-xs font-bold text-amber-700">{dupeCount} duplicate{dupeCount !== 1 ? 's' : ''}</span>
                </div>
              )}
            </div>

            {/* Row preview (first 8) */}
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {csvRows.slice(0, 8).map(({ row, isDuplicate }, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs border ${
                    isDuplicate
                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                      : 'bg-slate-50 border-line text-slate-700'
                  }`}
                >
                  {isDuplicate ? (
                    <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-3 h-3 flex-shrink-0 text-income" />
                  )}
                  <span className="font-medium truncate flex-1">{row.description}</span>
                  <span className="font-semibold flex-shrink-0">{row.date}</span>
                  <span className="font-bold flex-shrink-0">{row.amount}</span>
                </div>
              ))}
              {csvRows.length > 8 && (
                <p className="text-xs text-ink-soft font-medium text-center py-1">
                  …and {csvRows.length - 8} more rows
                </p>
              )}
            </div>

            {dupeCount > 0 && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={importSkipDupes}
                  onChange={(e) => setImportSkipDupes(e.target.checked)}
                  className="w-4 h-4 accent-brand-500"
                />
                <span className="text-xs font-semibold text-slate-700">Skip {dupeCount} duplicate{dupeCount !== 1 ? 's' : ''} on import</span>
              </label>
            )}

            <button
              onClick={handleCSVCommit}
              disabled={csvImporting || (importSkipDupes && newCount === 0)}
              className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-1.5"
            >
              <Upload className="w-4 h-4" />
              {csvImporting
                ? 'Importing…'
                : `Import ${importSkipDupes ? newCount : csvRows.length} Transaction${(importSkipDupes ? newCount : csvRows.length) !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}

        {csvMsg && (
          <p className="text-sm text-brand-600 font-medium">{csvMsg}</p>
        )}
      </div>

      {/* Audit Log */}
      <div className="bg-white rounded-xl border border-line p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-brand-600" />
            <h3 className="font-bold text-slate-900">Export Audit Log</h3>
          </div>
          <button
            onClick={toggleExportAuditLog}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              exportAuditLog ? 'bg-brand-500' : 'bg-slate-300'
            }`}
          >
            <div
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                exportAuditLog ? 'translate-x-5.5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
        {exportAuditLog && exportAuditEntries.length > 0 && (
          <div className="space-y-1">
            {exportAuditEntries.slice(-5).reverse().map((entry, i) => (
              <div key={i} className="text-xs text-slate-500 flex items-center gap-2 font-medium">
                <span>{new Date(entry.date).toLocaleString()}</span>
                <span className="bg-slate-100 border border-line px-1.5 py-0.5 rounded font-semibold">{entry.type}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legal */}
      <div className="bg-white rounded-xl border border-line p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-brand-600" />
          <h3 className="font-bold text-slate-900">Legal & Data Controller</h3>
        </div>
        <div className="p-3 bg-slate-50 border border-line rounded-lg text-[11px] text-slate-500 space-y-1.5 max-h-24 overflow-y-auto leading-relaxed font-medium">
          <p><strong>1. Decentralised Execution:</strong> All ledger summaries are compiled strictly browser-side. No financial data leaves your device.</p>
          <p><strong>2. Data Controller Assignment:</strong> You are the sole designated Data Controller for all data stored here, in accordance with applicable privacy frameworks.</p>
          <p><strong>3. Encryption:</strong> Data is encrypted locally via client-side AES-GCM keys derived from your password. LedgerJack holds no copy of your key.</p>
        </div>
      </div>

      <TipJar />

      {/* Tax region — locked & at the bottom to prevent accidental changes */}
      <div className="bg-white rounded-xl border border-line p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-brand-600" />
          <h3 className="font-bold text-slate-900">Tax region</h3>
        </div>
        <p className="text-sm text-ink">
          Currently set to <strong>{getFlagEmoji(TAX_REGIONS[region].countryCode)} {TAX_REGIONS[region].label}</strong>.
        </p>
        {!regionUnlocked ? (
          <>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Your region sets your currency, tax year and tax rules, and shapes all your figures. Changing it re-interprets your existing books, so it's locked. Keep separate businesses in different jurisdictions as separate installs/backups until multi-jurisdiction ledgers arrive.
              </p>
            </div>
            <input
              type="password"
              value={regionPassword}
              onChange={(e) => { setRegionPassword(e.target.value); setRegionError(''); }}
              placeholder="Password to change region"
              className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-white text-ink"
            />
            {regionError && <p className="text-xs font-bold text-red-700">{regionError}</p>}
            <button
              onClick={async () => {
                if (!regionPassword) { setRegionError('Enter your password to unlock.'); return; }
                const ok = await verifyPassword(regionPassword);
                if (!ok) { setRegionError('Incorrect password.'); return; }
                setRegionUnlocked(true); setRegionPassword('');
              }}
              className="w-full bg-brand-50 text-brand-700 border border-line py-2 rounded-lg text-sm font-bold"
            >
              Unlock to change region
            </button>
          </>
        ) : (
          <>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value as TaxRegion)}
              className="w-full px-3 py-2 border border-line rounded-lg text-sm text-slate-900 bg-white font-medium"
            >
              {Object.values(TAX_REGIONS).map((r) => (
                <option key={r.id} value={r.id}>{getFlagEmoji(r.countryCode)} {r.label}</option>
              ))}
            </select>
            <button onClick={() => setRegionUnlocked(false)} className="w-full bg-slate-100 text-slate-700 py-2 rounded-lg text-xs font-bold">Lock again</button>
          </>
        )}
      </div>

      {/* Danger zone */}
      <div className="bg-red-50/50 rounded-xl border-2 border-red-200 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-red-600" />
          <h3 className="font-bold text-red-900">Delete All My Data</h3>
        </div>
        <p className="text-xs text-red-700 font-medium">
          This permanently erases all transactions, receipts, mileage logs, and settings from this device. This action cannot be undone.
        </p>
        {!showConfirmPurge ? (
          <button
            onClick={() => setShowConfirmPurge(true)}
            className="w-full bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Delete All My Data
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-bold text-red-700">Enter your password to permanently erase all local data:</p>
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(''); }}
              placeholder="Your password"
              className="w-full px-3 py-2 border-2 border-red-300 rounded-lg text-sm text-slate-900 font-medium"
            />
            {deleteError && <p className="text-xs font-bold text-red-700">{deleteError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleDeleteAllData}
                className="flex-1 bg-red-700 hover:bg-red-800 text-white py-2 rounded-lg text-sm font-bold transition-colors"
              >
                Yes, wipe everything
              </button>
              <button
                onClick={() => { setShowConfirmPurge(false); setDeletePassword(''); setDeleteError(''); }}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg text-sm font-bold transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <IsThisForYouCard />

      <p className="text-center text-[11px] text-ink-soft pt-2 pb-1">{APP_MOTTO}</p>
    </div>
  );
}
