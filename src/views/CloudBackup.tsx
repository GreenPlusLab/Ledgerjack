/**
 * CloudBackup — choose where your encrypted backup goes, run it, and restore.
 * Everything leaving the device is end-to-end encrypted with your passphrase.
 */

import { useEffect, useState } from "react";
import { ArrowLeft, ShieldCheck, HardDriveDownload, Server, Upload, CheckCircle2, AlertTriangle } from "lucide-react";
import { useApp } from "../contexts/AppContext";
import {
  loadDestination, saveDestination, saveBackupSecrets, loadBackupSecrets, runBackup,
  type DestinationKind,
} from "../lib/cloudbackup/destinations";
import { importEncryptedBackup, exportEncryptedBackup } from "../lib/cloudbackup/encryptedBackup";
import { getLastBackupTimestamp, readFileAsText, downloadFile } from "../lib/backup";
import { nativeShareFile } from "../lib/share/share";
import { Mail } from "lucide-react";
import RecoveryKeyBackup from "../components/RecoveryKeyBackup";
import { recordLeft } from "../lib/privacy/store";
import OffDeviceCopyCard from "../components/OffDeviceCopyCard";
import EncryptAtRestCard from "../components/EncryptAtRestCard";

export default function CloudBackup({ onBack }: { onBack: () => void }) {
  const { updateBackupTimestamp } = useApp();
  const [kind, setKind] = useState<DestinationKind>("device");
  const [passphrase, setPassphrase] = useState("");
  const [webdavUrl, setWebdavUrl] = useState("");
  const [webdavUser, setWebdavUser] = useState("");
  const [webdavPassword, setWebdavPassword] = useState("");
  const [last, setLast] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [restorePass, setRestorePass] = useState("");
  const [useCustomPass, setUseCustomPass] = useState(false);

  useEffect(() => {
    loadDestination().then((d) => { if (d) { setKind(d.kind); setWebdavUrl(d.webdavUrl ?? ""); setWebdavUser(d.webdavUser ?? ""); } });
    loadBackupSecrets().then((s) => { if (s) { setPassphrase(s.passphrase); setWebdavPassword(s.webdavPassword ?? ""); } });
    getLastBackupTimestamp().then(setLast);
  }, []);

  async function saveAndBackup() {
    setMsg(null);
    if (passphrase.length < 8) { setMsg({ ok: false, text: useCustomPass ? "Choose a passphrase of at least 8 characters. You'll need it to restore." : "Paste your recovery key (the one you saved at setup). You'll use it to restore." }); return; }
    setBusy(true);
    try {
      await saveDestination({ kind, webdavUrl: webdavUrl.trim() || undefined, webdavUser: webdavUser.trim() || undefined });
      await saveBackupSecrets({ passphrase, webdavPassword: webdavPassword || undefined });
      const text = await runBackup();
      setLast(await getLastBackupTimestamp());
      updateBackupTimestamp();
      setMsg({ ok: true, text });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Backup failed." });
    } finally {
      setBusy(false);
    }
  }

  async function onRestoreFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg(null); setBusy(true);
    try {
      const blob = await readFileAsText(file);
      await importEncryptedBackup(blob, restorePass);
      setMsg({ ok: true, text: "Backup restored. Reopen the app if anything looks off." });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Restore failed." });
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  const opt = (k: DestinationKind, label: string, icon: React.ReactNode, soon = false) => (
    <button
      onClick={() => !soon && setKind(k)}
      disabled={soon}
      className={`flex items-center gap-2 w-full p-3 rounded-xl border-2 text-left ${kind === k && !soon ? "border-brand-500 bg-brand-50" : "border-line bg-white"} ${soon ? "opacity-60" : ""}`}
    >
      {icon}
      <span className="text-sm font-semibold text-slate-800 flex-1">{label}</span>
      {soon && <span className="text-[10px] font-bold uppercase text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">Coming soon</span>}
      {kind === k && !soon && <CheckCircle2 className="w-4 h-4 text-brand-600" />}
    </button>
  );

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="p-1 -ml-1 text-slate-500"><ArrowLeft className="w-5 h-5" /></button>
        <ShieldCheck className="w-5 h-5 text-brand-600" />
        <h2 className="text-lg font-bold text-slate-900">Backup</h2>
      </div>

      {/* Why it matters */}
      <div className="bg-brand-50 border-2 border-brand-200 rounded-xl p-3">
        <p className="text-xs text-brand-900 leading-relaxed">
          <span className="font-bold">Why this matters.</span> Your books live only on this device and are
          encrypted so only you can read them. The flip side: if you lose or wipe this device with no backup,
          your records are gone — and HMRC still expects you to keep them for up to 6 years. A backup is your
          safety net. It stays encrypted with your recovery key, so wherever you keep it, only you can open it —
          and there's no new password to remember.
        </p>
      </div>

      {last && <p className="text-[11px] text-income flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Last backup: {new Date(last).toLocaleString()}</p>}

      {/* Destination */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Where your data lives — your choice</p>
        <p className="text-[11px] text-slate-500 -mt-1">A locked file you keep (save it to your cloud, computer or USB through the Share menu), or a server you run yourself. Only you can open it.</p>
        {opt("device", "Encrypted file (save anywhere)", <HardDriveDownload className="w-5 h-5 text-slate-500" />)}
        {opt("webdav", "Your Nextcloud / WebDAV server", <Server className="w-5 h-5 text-slate-500" />)}
      </div>

      {kind === "webdav" && (
        <div className="bg-white rounded-xl border border-line p-3 space-y-2">
          <input value={webdavUrl} onChange={(e) => setWebdavUrl(e.target.value)} placeholder="WebDAV URL (e.g. https://cloud.me/remote.php/dav/files/me/)" className="w-full border-2 border-slate-300 rounded-lg px-3 py-2 text-xs" />
          <input value={webdavUser} onChange={(e) => setWebdavUser(e.target.value)} placeholder="Username" className="w-full border-2 border-slate-300 rounded-lg px-3 py-2 text-sm" />
          <input type="password" value={webdavPassword} onChange={(e) => setWebdavPassword(e.target.value)} placeholder="Password (stored encrypted on this device)" className="w-full border-2 border-slate-300 rounded-lg px-3 py-2 text-sm" />
          <p className="text-[10px] text-ink-soft">Some WebDAV servers block browser uploads (CORS). If yours does, use the encrypted file option and upload it yourself.</p>
        </div>
      )}

      {/* Secret: recovery key by default (nothing new to remember) */}
      <div className="bg-white rounded-xl border border-line p-3 space-y-1">
        <label className="text-xs font-semibold text-slate-700">
          {useCustomPass ? "Custom backup passphrase" : "Your recovery key"}
        </label>
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder={useCustomPass ? "At least 8 characters" : "Paste the recovery key you saved at setup"}
          className="w-full border-2 border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
        />
        {!useCustomPass ? (
          <p className="text-[10px] text-ink-soft">
            Your backup is protected by your <span className="font-semibold">recovery key</span> — the one you saved
            when you set up LedgerJack. Nothing new to remember: to restore, you'll use this same key. Keep it safe
            (you already needed it for your account).
          </p>
        ) : (
          <p className="text-[10px] text-ink-soft">
            A separate passphrase. Write it down safely — without it the backup can't be restored, and we can't
            recover it for you.
          </p>
        )}
        <button onClick={() => { setUseCustomPass(!useCustomPass); setPassphrase(""); }} className="text-[11px] font-semibold text-brand-600">
          {useCustomPass ? "Use my recovery key instead (recommended)" : "Prefer a separate passphrase?"}
        </button>
      </div>

      <button onClick={saveAndBackup} disabled={busy} className="w-full flex items-center justify-center gap-1.5 bg-brand-600 text-white py-2.5 rounded-lg text-sm font-bold disabled:opacity-50">
        <Upload className="w-4 h-4" /> {busy ? "Working…" : "Save destination & back up now"}
      </button>

      <button
        onClick={async () => {
          if (passphrase.length < 8) { setMsg({ ok: false, text: useCustomPass ? "Choose a passphrase of at least 8 characters first." : "Paste your recovery key first." }); return; }
          try {
            const blob = await exportEncryptedBackup(passphrase);
            const filename = `ledgerjack-backup-${new Date().toISOString().slice(0,10)}.ljenc`;
            const shared = await nativeShareFile(filename, blob, "application/octet-stream");
            void recordLeft("backup", shared ? "your Share menu" : "a file on this device", true);
            updateBackupTimestamp();
            setLast(await getLastBackupTimestamp());
            if (shared) {
              setMsg({ ok: true, text: "Pick your email app and send it to yourself. Keep your recovery key/passphrase safe — you'll need it to restore." });
            } else {
              downloadFile(blob, filename, "application/octet-stream");
              setMsg({ ok: true, text: "Backup downloaded. Attach it to an email to yourself to keep a safe off-device copy." });
            }
          } catch {
            setMsg({ ok: false, text: "Couldn't create the backup. Try again." });
          }
        }}
        className="w-full flex items-center justify-center gap-1.5 bg-brand-50 text-brand-700 border border-line py-2.5 rounded-lg text-sm font-bold"
      >
        <Mail className="w-4 h-4" /> Email a backup to yourself
      </button>

      {msg && (
        <div className={`rounded-xl border-2 p-3 flex items-start gap-2 ${msg.ok ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
          {msg.ok ? <CheckCircle2 className="w-4 h-4 text-income mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />}
          <p className={`text-xs ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>
        </div>
      )}

      {/* Keep a copy off this device — the nudge that replaces cloud integrations */}
      <OffDeviceCopyCard />

      {/* Recovery key backup — device + email */}
      <RecoveryKeyBackup />

      {/* Encrypt existing records at rest */}
      <EncryptAtRestCard />

      {/* Restore */}
      <div className="bg-white rounded-xl border border-line p-3 space-y-2">
        <p className="text-sm font-bold text-slate-900">Restore from a backup</p>
        <input type="password" value={restorePass} onChange={(e) => setRestorePass(e.target.value)} placeholder="Recovery key (or your backup passphrase)" className="w-full border-2 border-slate-300 rounded-lg px-3 py-2 text-sm font-mono" />
        <label className="block w-full text-center bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg text-sm font-semibold cursor-pointer">
          Choose backup file
          <input type="file" accept=".ljbackup,application/json,.json" onChange={onRestoreFile} disabled={busy} className="hidden" />
        </label>
        <p className="text-[10px] text-red-500">Restoring replaces the data currently on this device.</p>
      </div>
    </div>
  );
}
