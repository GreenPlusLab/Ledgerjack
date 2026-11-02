/**
 * Waiter — a few friendly questions, then one plain recommendation, like a
 * waiter helping a hungry customer. Fixed text, not AI: it works offline and the
 * same answers always give the same recommendation (see lib/privacy/choices.ts).
 *
 * Rules: recommend, never push; always state the price in money and privacy;
 * "Make my own" is always available; the choice can be changed later.
 */

import { useState } from "react";
import { ChevronLeft, Check, Wifi } from "lucide-react";
import PrivacyBadge from "./PrivacyBadge";
import {
  BACKUP_OPTIONS, PRESETS, PRESET_ORDER, READING_OPTIONS, WAITER_QUESTIONS,
  choiceWarnings, makeChoice, recommend,
  type BackupOption, type PrivacyChoice, type ReadingOption, type WaiterAnswers,
} from "../../lib/privacy/choices";
import { termsVersionFor } from "../../lib/privacy/terms";

type Stage = "questions" | "recommendation" | "options" | "custom";

export default function Waiter({ onChoose, initial }: { onChoose: (c: PrivacyChoice) => void; initial?: PrivacyChoice | null }) {
  const [stage, setStage] = useState<Stage>("questions");
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Partial<WaiterAnswers>>({});

  const finish = (reading: ReadingOption, backup: BackupOption, dataSaver: boolean) =>
    onChoose(makeChoice(reading, backup, dataSaver, termsVersionFor(reading)));

  if (stage === "questions") {
    const q = WAITER_QUESTIONS[qIndex];
    const pick = (value: string) => {
      const next = { ...answers, [q.key]: value } as Partial<WaiterAnswers>;
      setAnswers(next);
      if (qIndex + 1 < WAITER_QUESTIONS.length) setQIndex(qIndex + 1);
      else setStage("recommendation");
    };
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-ink-soft">Question {qIndex + 1} of {WAITER_QUESTIONS.length}</p>
          {qIndex > 0 && (
            <button onClick={() => setQIndex(qIndex - 1)} className="text-xs font-bold text-brand-700 flex items-center gap-0.5">
              <ChevronLeft className="w-3.5 h-3.5" /> Back
            </button>
          )}
        </div>
        <h2 className="text-lg font-bold text-slate-900 leading-snug">{q.question}</h2>
        <div className="space-y-2">
          {q.choices.map((c) => (
            <button
              key={c.value}
              onClick={() => pick(c.value)}
              className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-semibold transition-colors ${
                answers[q.key] === c.value ? "border-brand-500 bg-brand-50 text-brand-900" : "border-line bg-white text-ink hover:border-brand-300"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <button onClick={() => setStage("options")} className="w-full text-xs font-bold text-ink-soft py-1">
          Skip the questions and see all the options
        </button>
      </div>
    );
  }

  if (stage === "recommendation") {
    const r = recommend(answers as WaiterAnswers);
    const name = r.preset === "custom" ? "this mix" : `"${PRESETS[r.preset].name}"`;
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900">We suggest {name}</h2>
        <p className="text-sm text-slate-700 leading-relaxed">{r.summary}</p>
        <ChoiceRows reading={r.reading} backup={r.backup} dataSaver={r.dataSaver} />
        <div className="bg-slate-50 border border-line rounded-lg p-3">
          <p className="text-xs font-bold text-slate-900 mb-1">Good to know</p>
          <ul className="list-disc pl-4 space-y-1 text-xs text-slate-700">
            {r.goodToKnow.map((g) => <li key={g}>{g}</li>)}
          </ul>
        </div>
        <button onClick={() => finish(r.reading, r.backup, r.dataSaver)} className="w-full bg-brand-600 hover:bg-brand-700 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5">
          <Check className="w-4 h-4" /> Choose this
        </button>
        <button onClick={() => setStage("options")} className="w-full bg-white border border-line text-ink py-2.5 rounded-xl text-sm font-bold">
          Show me the other options
        </button>
        <p className="text-center text-[11px] text-ink-soft">You can change this any time in Settings.</p>
        <button onClick={() => { setQIndex(0); setStage("questions"); }} className="w-full text-xs font-bold text-ink-soft">Start the questions again</button>
      </div>
    );
  }

  if (stage === "options") {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">All the options</h2>
        <p className="text-xs text-slate-600">Each one says where your receipts go, what happens if you lose your phone, and what it costs.</p>
        {PRESET_ORDER.map((id) => {
          const p = PRESETS[id];
          return (
            <div key={id} className="bg-white border border-line rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-slate-900 text-sm">{p.name}{id === "privateSafe" && <span className="ml-1.5 text-[10px] font-bold text-brand-700">(suggested)</span>}</h3>
              </div>
              <p className="text-xs text-slate-700">{p.summary}</p>
              <ChoiceRows reading={p.reading} backup={p.backup} />
              <p className="text-[11px] text-slate-600"><strong>Good to know:</strong> {p.goodToKnow}</p>
              <button onClick={() => finish(p.reading, p.backup, answers.data === "limited")} className="w-full bg-brand-50 border border-brand-200 text-brand-800 py-2 rounded-lg text-xs font-bold">
                Choose {p.name}
              </button>
            </div>
          );
        })}
        <button onClick={() => setStage("custom")} className="w-full bg-white border-2 border-dashed border-line text-ink py-2.5 rounded-xl text-sm font-bold">
          Make my own
        </button>
        {Object.keys(answers).length === WAITER_QUESTIONS.length && (
          <button onClick={() => setStage("recommendation")} className="w-full text-xs font-bold text-ink-soft">Back to the suggestion</button>
        )}
      </div>
    );
  }

  return <CustomChoice initial={initial} dataSaverDefault={answers.data === "limited"} onBack={() => setStage("options")} onChoose={finish} />;
}

function ChoiceRows({ reading, backup, dataSaver }: { reading: ReadingOption; backup: BackupOption; dataSaver?: boolean }) {
  const r = READING_OPTIONS[reading];
  const b = BACKUP_OPTIONS[backup];
  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-bold text-slate-900 w-16 shrink-0">Receipts</span>
        <span className="text-slate-700">{r.label}</span>
        <PrivacyBadge colour={r.colour} text={r.word} small />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-bold text-slate-900 w-16 shrink-0">Backup</span>
        <span className="text-slate-700">{b.label}</span>
        <PrivacyBadge colour={b.colour} text={b.word} small />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-bold text-slate-900 w-16 shrink-0">Cost</span>
        <span className="text-slate-700">{reading === "ownKey" ? r.cost : "Free"}</span>
      </div>
      {dataSaver && (
        <div className="flex items-center gap-1.5 text-slate-700"><Wifi className="w-3.5 h-3.5" /> Data saver on</div>
      )}
    </div>
  );
}

function CustomChoice({ initial, dataSaverDefault, onBack, onChoose }: {
  initial?: PrivacyChoice | null; dataSaverDefault: boolean; onBack: () => void;
  onChoose: (r: ReadingOption, b: BackupOption, d: boolean) => void;
}) {
  const [reading, setReading] = useState<ReadingOption>(initial?.reading ?? "ocr");
  const [backup, setBackup] = useState<BackupOption>(initial?.backup ?? "cloudShare");
  const [dataSaver, setDataSaver] = useState(initial?.dataSaver ?? dataSaverDefault);
  const warnings = choiceWarnings({ reading, backup });

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs font-bold text-brand-700 flex items-center gap-0.5"><ChevronLeft className="w-3.5 h-3.5" /> All the options</button>
      <h2 className="text-lg font-bold text-slate-900">Make my own</h2>

      <fieldset className="space-y-2">
        <legend className="text-sm font-bold text-slate-900 mb-1">How should receipts be read?</legend>
        {(Object.keys(READING_OPTIONS) as ReadingOption[]).map((k) => {
          const o = READING_OPTIONS[k];
          return (
            <label key={k} className={`block border-2 rounded-xl p-3 cursor-pointer ${reading === k ? "border-brand-500 bg-brand-50" : "border-line bg-white"}`}>
              <div className="flex items-center gap-2">
                <input type="radio" name="reading" checked={reading === k} onChange={() => setReading(k)} className="accent-brand-600" />
                <span className="text-sm font-bold text-slate-900">{o.label}</span>
              </div>
              <p className="text-xs text-slate-600 mt-1 ml-5">{o.where} {o.cost}.</p>
              <div className="ml-5 mt-1"><PrivacyBadge colour={o.colour} text={o.word} small /></div>
            </label>
          );
        })}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-bold text-slate-900 mb-1">Where should your locked backup go?</legend>
        {(["cloudShare", "computer", "webdav", "deviceOnly", "none"] as BackupOption[]).map((k) => {
          const o = BACKUP_OPTIONS[k];
          return (
            <label key={k} className={`block border-2 rounded-xl p-3 cursor-pointer ${backup === k ? "border-brand-500 bg-brand-50" : "border-line bg-white"}`}>
              <div className="flex items-center gap-2">
                <input type="radio" name="backup" checked={backup === k} onChange={() => setBackup(k)} className="accent-brand-600" />
                <span className="text-sm font-bold text-slate-900">{o.label}</span>
              </div>
              <p className="text-xs text-slate-600 mt-1 ml-5">{o.where}</p>
              <div className="ml-5 mt-1"><PrivacyBadge colour={o.colour} text={o.word} small /></div>
            </label>
          );
        })}
      </fieldset>

      <label className="flex items-start gap-2 bg-white border border-line rounded-xl p-3">
        <input type="checkbox" checked={dataSaver} onChange={(e) => setDataSaver(e.target.checked)} className="mt-0.5 accent-brand-600" />
        <span className="text-xs text-slate-700"><strong className="text-slate-900">Data saver.</strong> Text recognition works offline, and LedgerJack suggests backing up when you're on Wi-Fi.</span>
      </label>

      {warnings.length > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-3 space-y-1">
          {warnings.map((w) => <p key={w} className="text-xs font-semibold text-red-900">{w}</p>)}
        </div>
      )}

      <button onClick={() => onChoose(reading, backup, dataSaver)} className="w-full bg-brand-600 text-white py-3 rounded-xl text-sm font-bold">
        Use these settings
      </button>
    </div>
  );
}
