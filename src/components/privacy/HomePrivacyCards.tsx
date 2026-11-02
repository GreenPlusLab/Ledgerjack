/**
 * HomePrivacyCards — the home-screen pieces of the privacy design:
 *  - the backup health light (green / amber / red, one tap to back up);
 *  - a reminder until the recovery key has been checked (only with a vault);
 *  - a notice when a service's terms changed since the person chose it.
 */

import { useEffect, useState } from "react";
import { ChevronRight, KeyRound, FileText, Wifi } from "lucide-react";
import { useApp } from "../../contexts/AppContext";
import { useCrypto } from "../../contexts/CryptoContext";
import { ColourDot } from "./PrivacyBadge";
import { backupHealth } from "../../lib/privacy/health";
import { CHOICE_CHANGED_EVENT, isRecoveryKeyChecked, loadChoice } from "../../lib/privacy/store";
import { needsReask, termsFor } from "../../lib/privacy/terms";
import type { PrivacyChoice } from "../../lib/privacy/choices";

const BOX = {
  green: "bg-emerald-50 border-emerald-300",
  amber: "bg-amber-50 border-amber-300",
  orange: "bg-orange-50 border-orange-400",
  red: "bg-red-50 border-red-400",
} as const;

export default function HomePrivacyCards({ onNavigate }: { onNavigate: (view: "cloud-backup" | "privacy" | "recovery-check") => void }) {
  const { lastBackupTimestamp } = useApp();
  const { hasVault } = useCrypto();
  const [choice, setChoice] = useState<PrivacyChoice | null | undefined>(undefined);
  const [keyChecked, setKeyChecked] = useState<boolean | null>(null);

  useEffect(() => {
    const load = () => { loadChoice().then(setChoice); isRecoveryKeyChecked().then(setKeyChecked); };
    load();
    window.addEventListener(CHOICE_CHANGED_EVENT, load);
    return () => window.removeEventListener(CHOICE_CHANGED_EVENT, load);
  }, []);

  const health = backupHealth(lastBackupTimestamp, Date.now(), choice?.backup === "deviceOnly");
  const online = typeof navigator === "undefined" || navigator.onLine;
  const termsChanged = choice ? needsReask(choice.reading, choice.termsVersion) : false;

  return (
    <div className="space-y-2">
      <button
        onClick={() => onNavigate("cloud-backup")}
        className={`w-full text-left border-2 rounded-xl p-3 flex items-center gap-3 ${BOX[health.colour]}`}
        aria-label={`Backup: ${health.headline}. ${health.detail}`}
      >
        <ColourDot colour={health.colour} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900">{health.headline}</p>
          <p className="text-xs text-slate-700 leading-snug">{health.detail}</p>
          {choice?.dataSaver && health.colour !== "green" && !online && (
            <p className="text-[11px] text-slate-600 mt-0.5 flex items-center gap-1"><Wifi className="w-3 h-3" /> Data saver: back up when you're on Wi-Fi.</p>
          )}
        </div>
        <span className="text-xs font-bold text-brand-700 whitespace-nowrap flex items-center">
          {health.colour === "green" ? "Details" : "Back up"} <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </button>

      {choice === null && (
        <button onClick={() => onNavigate("privacy")} className="w-full text-left bg-white border-2 border-brand-300 rounded-xl p-3 flex items-center gap-3">
          <FileText className="w-5 h-5 text-brand-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-slate-900">Choose how LedgerJack reads receipts and keeps backups</p>
            <p className="text-xs text-slate-700">A few quick questions. Nothing leaves your phone until you choose.</p>
          </div>
          <ChevronRight className="w-4 h-4 text-brand-600" />
        </button>
      )}

      {hasVault && keyChecked === false && (
        <button onClick={() => onNavigate("recovery-check")} className="w-full text-left bg-amber-50 border-2 border-amber-300 rounded-xl p-3 flex items-center gap-3">
          <KeyRound className="w-5 h-5 text-amber-700 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-slate-900">Check your recovery key</p>
            <p className="text-xs text-slate-700">It's the only way back in if you forget your password. Takes a minute.</p>
          </div>
          <ChevronRight className="w-4 h-4 text-amber-700" />
        </button>
      )}

      {termsChanged && choice && (
        <button onClick={() => onNavigate("privacy")} className="w-full text-left bg-amber-50 border-2 border-amber-300 rounded-xl p-3 flex items-center gap-3">
          <FileText className="w-5 h-5 text-amber-700 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-slate-900">{termsFor(choice.reading)?.name}: terms have changed</p>
            <p className="text-xs text-slate-700">See what changed and choose again. Nothing has been changed for you.</p>
          </div>
          <ChevronRight className="w-4 h-4 text-amber-700" />
        </button>
      )}
    </div>
  );
}
