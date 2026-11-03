/**
 * LeftMyPhone — "What left my phone": a plain monthly record of everything that
 * went off this device. Only what kind of thing, where and when; never content.
 */

import { useEffect, useState } from "react";
import { ArrowLeft, Lock, Unlock, Smartphone } from "lucide-react";
import { loadLeftLog } from "../lib/privacy/store";
import { monthsToShow, summariseMonth, type LeftEntry } from "../lib/privacy/leftPhone";

const monthName = (m: string) => {
  const [y, mm] = m.split("-").map(Number);
  return new Date(Date.UTC(y!, (mm ?? 1) - 1, 1)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
};

export default function LeftMyPhone({ onBack }: { onBack: () => void }) {
  const [log, setLog] = useState<LeftEntry[] | null>(null);
  useEffect(() => { loadLeftLog().then(setLog); }, []);

  return (
    <div className="space-y-4 pb-24">
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-bold text-brand-700"><ArrowLeft className="w-4 h-4" /> Back</button>
      <div>
        <h2 className="text-xl font-bold text-slate-900">What left my phone</h2>
        <p className="text-sm text-slate-600 mt-1">
          Everything that went off this phone, month by month. It records only what kind of thing, where it went and when, never what was in it.
        </p>
      </div>

      {log === null ? null : monthsToShow(log).map((m) => {
        const s = summariseMonth(log, m);
        const entries = log.filter((e) => e.at.slice(0, 7) === m);
        return (
          <section key={m} className="bg-white border border-line rounded-xl p-4 space-y-2">
            <h3 className="font-bold text-slate-900">{monthName(m)}</h3>
            {s.nothing ? (
              <p className="text-sm text-emerald-800 flex items-center gap-1.5"><Smartphone className="w-4 h-4" /> Nothing left your phone.</p>
            ) : (
              <>
                <ul className="space-y-1">
                  {s.lines.map((l) => <li key={l} className="text-sm text-slate-800">{l}</li>)}
                </ul>
                <details>
                  <summary className="text-xs font-bold text-brand-700 cursor-pointer">Every item ({entries.length})</summary>
                  <ul className="mt-2 space-y-1">
                    {[...entries].reverse().map((e, i) => (
                      <li key={i} className="text-xs text-slate-600 flex items-center gap-1.5">
                        {e.locked ? <Lock className="w-3 h-3 text-emerald-700" aria-label="locked" /> : <Unlock className="w-3 h-3 text-amber-700" aria-label="not locked" />}
                        {new Date(e.at).toLocaleString()} · {e.to}
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            )}
          </section>
        );
      })}

      <p className="text-xs text-slate-500">
        Kept on this phone for 13 months. The padlock means the item was locked before it left, so only someone with your recovery key or backup passphrase can open it.
      </p>
    </div>
  );
}
