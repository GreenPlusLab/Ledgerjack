/**
 * PrivacySettings — your privacy choices: what you chose, in colours and plain
 * words; ask the waiter again; data saver; the AI monthly limit; what each
 * outside service does with what you send (with the date we checked); and a
 * link to "What left my phone".
 */

import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, History, KeyRound, ExternalLink } from "lucide-react";
import Waiter from "../components/privacy/Waiter";
import PrivacyBadge from "../components/privacy/PrivacyBadge";
import {
  BACKUP_OPTIONS, PRESETS, READING_OPTIONS, makeChoice, type PrivacyChoice,
} from "../lib/privacy/choices";
import { loadAiLimit, loadChoice, saveAiLimit, saveChoice } from "../lib/privacy/store";
import { TERMS, NOT_OFFERED, needsReask, termsFor, termsVersionFor } from "../lib/privacy/terms";

export default function PrivacySettings({ onBack, onNavigate }: { onBack: () => void; onNavigate: (v: "left-phone" | "recovery-check") => void }) {
  const [choice, setChoice] = useState<PrivacyChoice | null | undefined>(undefined);
  const [asking, setAsking] = useState(false);
  const [limit, setLimit] = useState<string>("");
  const [limitMsg, setLimitMsg] = useState("");

  useEffect(() => {
    loadChoice().then((c) => { setChoice(c); if (!c) setAsking(true); });
    loadAiLimit().then((l) => setLimit(l === null ? "" : String(l)));
  }, []);

  const choose = async (c: PrivacyChoice) => { await saveChoice(c); setChoice(c); setAsking(false); };

  const saveLimit = async () => {
    const t = limit.trim();
    if (t === "") { await saveAiLimit(null); setLimitMsg("No monthly limit."); return; }
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) { setLimitMsg("Type an amount like 2 or 5.50, or leave it empty."); return; }
    await saveAiLimit(Math.round(n * 100) / 100);
    setLimitMsg(n === 0 ? "AI is paused: the limit is $0." : `AI pauses once this month's AI spending reaches $${n.toFixed(2)}.`);
  };

  if (choice === undefined) return null;

  if (asking) {
    return (
      <div className="space-y-4 pb-24">
        <button onClick={() => (choice ? setAsking(false) : onBack())} className="flex items-center gap-1 text-sm font-bold text-brand-700"><ArrowLeft className="w-4 h-4" /> Back</button>
        <div className="bg-white border border-line rounded-2xl p-4"><Waiter onChoose={choose} initial={choice} /></div>
      </div>
    );
  }

  const r = choice ? READING_OPTIONS[choice.reading] : null;
  const b = choice ? BACKUP_OPTIONS[choice.backup] : null;
  const reask = choice ? needsReask(choice.reading, choice.termsVersion) : false;

  return (
    <div className="space-y-4 pb-24">
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-bold text-brand-700"><ArrowLeft className="w-4 h-4" /> Back</button>
      <h2 className="text-xl font-bold text-slate-900">Your privacy choices</h2>

      {choice && r && b && (
        <section className="bg-white border border-line rounded-xl p-4 space-y-3">
          <p className="text-sm font-bold text-slate-900">{choice.preset === "custom" ? "Your own mix" : PRESETS[choice.preset].name}</p>
          <div className="space-y-2 text-sm">
            <div>
              <p className="font-semibold text-slate-900">Receipts: {r.label}</p>
              <p className="text-xs text-slate-600">{r.where} {r.cost}.</p>
              <div className="mt-1"><PrivacyBadge colour={r.colour} text={r.word} /></div>
            </div>
            <div>
              <p className="font-semibold text-slate-900">Backup: {b.label}</p>
              <p className="text-xs text-slate-600">{b.where}</p>
              <div className="mt-1"><PrivacyBadge colour={b.colour} text={b.word} /></div>
            </div>
          </div>
          <label className="flex items-start gap-2 pt-2 border-t border-line">
            <input
              type="checkbox"
              checked={choice.dataSaver}
              onChange={(e) => choose(makeChoice(choice.reading, choice.backup, e.target.checked, choice.termsVersion))}
              className="mt-0.5 accent-brand-600"
            />
            <span className="text-xs text-slate-700"><strong className="text-slate-900">Data saver.</strong> Text recognition works offline, and LedgerJack suggests backing up when you're on Wi-Fi.</span>
          </label>
          <p className="text-[11px] text-ink-soft">Chosen {choice.chosenAt}.</p>
        </section>
      )}

      {reask && choice && (
        <section className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 space-y-2">
          <p className="text-sm font-bold text-slate-900">{termsFor(choice.reading)?.name}: what changed</p>
          <ul className="list-disc pl-4 text-xs text-slate-800 space-y-1">
            {termsFor(choice.reading)?.summary.map((s) => <li key={s}>{s}</li>)}
          </ul>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => choose(makeChoice(choice.reading, choice.backup, choice.dataSaver, termsVersionFor(choice.reading)))} className="bg-white border border-line py-2 rounded-lg text-xs font-bold">Keep my choice</button>
            <button onClick={() => setAsking(true)} className="bg-brand-600 text-white py-2 rounded-lg text-xs font-bold">Choose again</button>
          </div>
        </section>
      )}

      <button onClick={() => setAsking(true)} className="w-full bg-brand-600 text-white py-3 rounded-xl text-sm font-bold">
        Ask me the questions again
      </button>

      <button onClick={() => onNavigate("left-phone")} className="w-full bg-white border border-line rounded-xl p-4 flex items-center justify-between text-left">
        <span className="flex items-center gap-2"><History className="w-5 h-5 text-brand-600" /><span><span className="block font-bold text-slate-900 text-sm">What left my phone</span><span className="block text-xs text-slate-500">Everything that went off this phone, month by month</span></span></span>
        <ChevronRight className="w-4 h-4 text-ink-soft" />
      </button>

      <button onClick={() => onNavigate("recovery-check")} className="w-full bg-white border border-line rounded-xl p-4 flex items-center justify-between text-left">
        <span className="flex items-center gap-2"><KeyRound className="w-5 h-5 text-brand-600" /><span><span className="block font-bold text-slate-900 text-sm">Check my recovery key</span><span className="block text-xs text-slate-500">Prove your saved copy works, or save it again</span></span></span>
        <ChevronRight className="w-4 h-4 text-ink-soft" />
      </button>

      <section className="bg-white border border-line rounded-xl p-4 space-y-2">
        <h3 className="font-bold text-slate-900 text-sm">Monthly AI limit</h3>
        <p className="text-xs text-slate-600">If you use AI with your own account, AI pauses when this month's spending reaches this amount. AI companies charge in US dollars. Leave empty for no limit.</p>
        <div className="flex gap-2">
          <div className="flex items-center border border-line rounded-lg px-2 bg-white flex-1">
            <span className="text-sm text-ink-soft">$</span>
            <input inputMode="decimal" value={limit} onChange={(e) => { setLimit(e.target.value); setLimitMsg(""); }} placeholder="e.g. 3" className="w-full px-1 py-2 text-sm outline-none" />
          </div>
          <button onClick={saveLimit} className="px-4 bg-brand-50 border border-brand-200 text-brand-800 rounded-lg text-xs font-bold">Save</button>
        </div>
        {limitMsg && <p className="text-xs text-brand-700 font-medium">{limitMsg}</p>}
      </section>

      <section className="bg-white border border-line rounded-xl p-4 space-y-3">
        <h3 className="font-bold text-slate-900 text-sm">What outside services do with what you send</h3>
        {Object.values(TERMS).map((t) => (
          <div key={t.name} className="space-y-1">
            <p className="text-xs font-bold text-slate-900">{t.name}</p>
            <ul className="list-disc pl-4 text-xs text-slate-700 space-y-0.5">{t.summary.map((s) => <li key={s}>{s}</li>)}</ul>
            <p className="text-[11px] text-ink-soft">Checked {t.checked}.{" "}
              {t.sources.map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="text-brand-700 font-semibold inline-flex items-center gap-0.5 mr-2">{s.title}<ExternalLink className="w-3 h-3" /></a>
              ))}
            </p>
          </div>
        ))}
        <p className="text-[11px] text-slate-600">
          Not offered: {NOT_OFFERED.join(", ")}. Google's terms ask people not to send personal information to its free tier, and receipts are personal.
        </p>
      </section>
    </div>
  );
}
