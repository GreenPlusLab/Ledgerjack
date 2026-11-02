/**
 * RecoveryKeyCheck — save the recovery key (download, print or share), then
 * prove it was kept by typing back two groups from the saved copy. The key is
 * hidden during the check, so it can't simply be copied from the screen.
 */

import { useMemo, useState } from "react";
import { Download, Printer, Share2, Check, AlertTriangle, KeyRound } from "lucide-react";
import { checkKeyGroups, keyGroups, pickCheckPositions } from "../../lib/privacy/health";
import { printRecoverySheet, recoveryFileBody } from "../../lib/privacy/recoverySheet";
import { markRecoveryKeyChecked } from "../../lib/privacy/store";
import { downloadFile } from "../../lib/backup";
import { nativeShareFile } from "../../lib/share/share";

function randomPair(n: number): [number, number] {
  const r = new Uint32Array(2);
  crypto.getRandomValues(r);
  return pickCheckPositions(n, r[0]!, r[1]!);
}

export default function RecoveryKeyCheck({ recoveryKey, onDone, allowLater = true }: {
  recoveryKey: string;
  onDone: (checked: boolean) => void;
  allowLater?: boolean;
}) {
  const groups = useMemo(() => keyGroups(recoveryKey), [recoveryKey]);
  const [positions] = useState<[number, number]>(() => randomPair(groups.length));
  const [stage, setStage] = useState<"save" | "check" | "later">("save");
  const [saved, setSaved] = useState(false);
  const [typed, setTyped] = useState<[string, string]>(["", ""]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const filename = `ledgerjack-recovery-key-${new Date().toISOString().slice(0, 10)}.txt`;

  const download = () => { downloadFile(recoveryFileBody(recoveryKey), filename, "text/plain"); setSaved(true); setMsg("Saved to your device. Move it somewhere safe and private."); };
  const print = () => { if (printRecoverySheet(recoveryKey)) { setSaved(true); setMsg("Print the sheet and keep it somewhere safe."); } else setMsg("Your browser blocked the print window. Allow pop-ups for LedgerJack, or download the key instead."); };
  const share = async () => {
    const ok = await nativeShareFile(filename, recoveryFileBody(recoveryKey), "text/plain");
    if (ok) { setSaved(true); setMsg("Save it to a password manager or email it to yourself, kept apart from your backup."); }
    else download();
  };

  const check = async () => {
    if (checkKeyGroups(recoveryKey, positions, typed)) {
      await markRecoveryKeyChecked();
      onDone(true);
    } else {
      setError("That doesn't match. Check you're looking at the key you just saved, and that capital letters match.");
    }
  };

  if (stage === "later") {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-300 rounded-xl p-3 flex gap-2">
          <AlertTriangle className="w-5 h-5 text-red-700 shrink-0" />
          <p className="text-xs text-red-900 leading-relaxed">
            Without your recovery key, nobody can open your books if you forget your password, not even us. LedgerJack will remind you on the home screen until you check it. You can do it from Settings.
          </p>
        </div>
        <button onClick={() => onDone(false)} className="w-full bg-white border border-line text-ink py-2.5 rounded-xl text-sm font-bold">I understand, remind me later</button>
        <button onClick={() => setStage("save")} className="w-full bg-brand-600 text-white py-3 rounded-xl text-sm font-bold">Go back and save it now</button>
      </div>
    );
  }

  if (stage === "save") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-brand-600" />
          <h2 className="text-lg font-bold text-slate-900">Save your recovery key</h2>
        </div>
        <p className="text-sm text-slate-700 leading-relaxed">
          It's the only way back into your books if you forget your password. Keep it private, and not in the same place as your backup.
        </p>
        <div className="grid grid-cols-4 gap-1.5 bg-slate-50 border border-line rounded-xl p-3">
          {groups.map((g, i) => (
            <div key={i} className="text-center">
              <span className="block text-[9px] text-ink-soft">{i + 1}</span>
              <code className="text-sm font-mono font-bold text-ink tracking-wide">{g}</code>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button onClick={download} className="flex flex-col items-center gap-1 bg-brand-50 border border-line text-brand-800 py-2.5 rounded-xl text-xs font-bold"><Download className="w-4 h-4" />Download</button>
          <button onClick={print} className="flex flex-col items-center gap-1 bg-brand-50 border border-line text-brand-800 py-2.5 rounded-xl text-xs font-bold"><Printer className="w-4 h-4" />Print</button>
          <button onClick={share} className="flex flex-col items-center gap-1 bg-brand-50 border border-line text-brand-800 py-2.5 rounded-xl text-xs font-bold"><Share2 className="w-4 h-4" />Password app</button>
        </div>
        {msg && <p className="text-xs text-brand-700 font-medium">{msg}</p>}
        <button onClick={() => setStage("check")} disabled={!saved} className="w-full bg-brand-600 disabled:opacity-40 text-white py-3 rounded-xl text-sm font-bold">
          I've saved it, check it
        </button>
        {allowLater && <button onClick={() => setStage("later")} className="w-full text-xs font-bold text-ink-soft">I'll do this later</button>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-slate-900">Check you kept it</h2>
      <p className="text-sm text-slate-700 leading-relaxed">
        The key is hidden now. Open the copy you saved and type group <strong>{positions[0]}</strong> and group <strong>{positions[1]}</strong>.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {[0, 1].map((i) => (
          <label key={i} className="block">
            <span className="text-xs font-bold text-slate-900">Group {positions[i]}</span>
            <input
              value={typed[i]}
              onChange={(e) => { const t: [string, string] = [...typed]; t[i] = e.target.value; setTyped(t); setError(""); }}
              autoCapitalize="off" autoCorrect="off" spellCheck={false} maxLength={6}
              className="mt-1 w-full px-3 py-2 border-2 border-line rounded-lg font-mono text-base text-center"
            />
          </label>
        ))}
      </div>
      {error && <p className="text-xs font-semibold text-red-800">{error}</p>}
      <button onClick={check} className="w-full bg-brand-600 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5"><Check className="w-4 h-4" />Check</button>
      <button onClick={() => { setStage("save"); setTyped(["", ""]); setError(""); }} className="w-full text-xs font-bold text-ink-soft">Show the key again</button>
    </div>
  );
}
