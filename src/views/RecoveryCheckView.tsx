/**
 * RecoveryCheckView — from Settings or the home-screen reminder: enter your
 * password to show the recovery key, save it, then prove the saved copy works.
 */

import { useState } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { useCrypto } from "../contexts/CryptoContext";
import RecoveryKeyCheck from "../components/privacy/RecoveryKeyCheck";

export default function RecoveryCheckView({ onBack }: { onBack: () => void }) {
  const { exportRecoveryKey, hasVault } = useCrypto();
  const [password, setPassword] = useState("");
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const unlock = async () => {
    if (!password) { setError("Enter your password."); return; }
    setBusy(true); setError("");
    try {
      const k = await exportRecoveryKey(password);
      if (!k) { setError("Incorrect password."); return; }
      setKey(k); setPassword("");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 pb-24">
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-bold text-brand-700"><ArrowLeft className="w-4 h-4" /> Back</button>
      <div className="bg-white border border-line rounded-2xl p-4">
        {!hasVault ? (
          <p className="text-sm text-slate-700">Your books aren't locked with a password yet, so there's no recovery key. Turn on encryption in Settings to get one.</p>
        ) : done ? (
          <div className="text-center space-y-2 py-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
            <p className="font-bold text-slate-900">Your recovery key checks out</p>
            <p className="text-sm text-slate-600">Keep that copy safe and private, apart from your backup.</p>
            <button onClick={onBack} className="mt-2 w-full bg-brand-600 text-white py-2.5 rounded-xl text-sm font-bold">Done</button>
          </div>
        ) : key ? (
          <RecoveryKeyCheck recoveryKey={key} allowLater={false} onDone={(ok) => { setKey(null); if (ok) setDone(true); }} />
        ) : (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900">Check your recovery key</h2>
            <p className="text-sm text-slate-700">Enter your password to see your recovery key, save it again if you need to, and check your saved copy.</p>
            <input
              type="password" value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") unlock(); }}
              placeholder="Your password"
              className="w-full px-3 py-2.5 border-2 border-line rounded-lg text-sm"
            />
            {error && <p className="text-xs font-bold text-red-700">{error}</p>}
            <button onClick={unlock} disabled={busy} className="w-full bg-brand-600 text-white py-2.5 rounded-xl text-sm font-bold disabled:opacity-50">{busy ? "Checking…" : "Show my recovery key"}</button>
          </div>
        )}
      </div>
    </div>
  );
}
