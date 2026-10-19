/**
 * AskYourBooks — answers "how much did I spend on X?" from the user's own
 * entries, with no AI. Pick what, on what and when; the answer is worked out
 * on the device.
 */

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import type { Entry } from "../lib/bookscheck/entries";
import {
  answerQuery, categoriesFor, describeAnswer, periodLabel, PERIODS,
  type Measure, type PeriodKey,
} from "../lib/insights/ask";

export default function AskYourBooks({
  entries, today, fy, money, yearWord,
}: {
  entries: Entry[];
  today: string;
  fy: { month: number; day: number };
  money: (c: number) => string;
  yearWord: string;
}) {
  const [measure, setMeasure] = useState<Measure>("spent");
  const [category, setCategory] = useState("all");
  const [period, setPeriod] = useState<PeriodKey>("this-year");

  const categories = categoriesFor(entries, measure);
  const safeCategory = category === "all" || categories.includes(category) ? category : "all";
  const answer = answerQuery(entries, { measure, category: safeCategory, period }, today, fy);

  const select = "w-full border-2 border-slate-300 rounded-lg px-2 py-2 text-sm bg-white";

  return (
    <div className="bg-white rounded-xl border border-line p-4 space-y-3">
      <div className="flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-brand-600" />
        <h3 className="font-bold text-slate-900 text-sm">Ask your books</h3>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <label className="text-xs text-slate-500">
          How much did I
          <select
            value={measure}
            onChange={(e) => { setMeasure(e.target.value as Measure); setCategory("all"); }}
            className={`mt-1 ${select}`}
          >
            <option value="spent">spend</option>
            <option value="earned">earn</option>
          </select>
        </label>
        <label className="text-xs text-slate-500">
          {measure === "earned" ? "from" : "on"}
          <select value={safeCategory} onChange={(e) => setCategory(e.target.value)} className={`mt-1 ${select}`}>
            <option value="all">{measure === "earned" ? "all income" : "everything"}</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          when
          <select value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)} className={`mt-1 ${select}`}>
            {PERIODS.map((p) => <option key={p} value={p}>{periodLabel(p, yearWord)}</option>)}
          </select>
        </label>
      </div>

      <div className="bg-brand-50 border border-brand-200 rounded-lg p-3 space-y-1">
        <p className="text-sm font-semibold text-ink">{describeAnswer(answer, money, yearWord)}</p>
        {answer.largest.length > 0 && (
          <p className="text-xs text-ink-soft">
            Largest: {answer.largest.map((l) => `${l.description || "(no description)"} ${money(l.amountCents)} (${l.date})`).join(", ")}.
          </p>
        )}
        {answer.pendingCount > 0 && (
          <p className="text-xs text-amber-700">
            {answer.pendingCount} matching entr{answer.pendingCount === 1 ? "y is" : "ies are"} still in your review queue and not included.
          </p>
        )}
      </div>
      <p className="text-[10px] text-ink-soft">Worked out from your own entries on this device. No AI, nothing sent anywhere.</p>
    </div>
  );
}
