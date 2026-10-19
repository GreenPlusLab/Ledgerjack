/**
 * Insights — educational view. LedgerJack computes the numbers; the AI only
 * explains them in plain English (opt-in, on the user's own key). Warnings and
 * "discuss with your accountant" are front and centre. Jurisdiction-aware.
 */

import { useEffect, useState } from "react";
import { ArrowLeft, Lightbulb, AlertTriangle, Sparkles, Loader2, Send } from "lucide-react";
import { useApp } from "../contexts/AppContext";
import { TAX_REGIONS } from "../lib/regions";
import { computeMetrics, type FinancialMetrics } from "../lib/insights/metrics";
import { generateInsight, askFollowUp } from "../lib/ai/insightService";
import { modelsForRole, getSelectedModel } from "../lib/ai/aiModels";
import DeadlineCalendar from "../components/DeadlineCalendar";
import WhatChanged from "../components/WhatChanged";
import AskYourBooks from "../components/AskYourBooks";
import { loadEntries } from "../lib/bookscheck/load";
import { localToday, type Entry } from "../lib/bookscheck/entries";
import { formatCurrency } from "../lib/currency";

function fiscalYearWindow(startMonth: number, startDay: number, now = new Date()) {
  const m0 = startMonth - 1;
  const afterStart =
    now.getUTCMonth() > m0 || (now.getUTCMonth() === m0 && now.getUTCDate() >= startDay);
  const startYear = afterStart ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const from = new Date(Date.UTC(startYear, m0, startDay));
  const to = new Date(Date.UTC(startYear + 1, m0, startDay - 1));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default function Insights({ onBack }: { onBack: () => void }) {
  const { region, apiKey } = useApp();
  const cfg = TAX_REGIONS[region];
  const money = (n: number) => `${cfg.currencySymbol}${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
  const [modelId, setModelId] = useState(getSelectedModel('insights'));
  const [narration, setNarration] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chat, setChat] = useState<{ q: string; a: string }[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const today = localToday();
  const cents = (c: number) => formatCurrency(c, region);
  const yearWord = region === "uk" ? "tax year" : "financial year";

  const win = fiscalYearWindow(cfg.fiscalYearStart.month, cfg.fiscalYearStart.day);

  useEffect(() => {
    computeMetrics(win.from, win.to).then(setMetrics);
    loadEntries().then(setEntries).catch(() => setEntries([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function explain() {
    if (!metrics) return;
    setBusy(true); setError(null); setNarration(null);
    try {
      const text = await generateInsight(metrics, region, apiKey, modelId);
      setNarration(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't generate the explanation.");
    } finally {
      setBusy(false);
    }
  }

  async function ask() {
    if (!metrics || !question.trim()) return;
    const q = question.trim();
    setQuestion(""); setAsking(true); setError(null);
    try {
      const a = await askFollowUp(metrics, region, apiKey, modelId, q);
      setChat((c) => [...c, { q, a }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't answer that.");
      setQuestion(q);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="p-1 -ml-1 text-slate-500"><ArrowLeft className="w-5 h-5" /></button>
        <Lightbulb className="w-5 h-5 text-brand-600" />
        <h2 className="text-lg font-bold text-slate-900">Insights</h2>
      </div>

      {/* Educational warning — front and centre */}
      <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-3 flex gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-800">
          Educational information only — not tax, accounting or financial advice. Figures are based
          only on the transactions you've entered, and AI explanations can be wrong. Keeping a
          professional in the loop is standard practice — discuss anything important with a qualified accountant.
        </p>
      </div>

      {!metrics && <p className="text-sm text-ink-soft">Adding up your numbers…</p>}

      {metrics && (
        <>
          <p className="text-xs text-ink-soft">
            Based on {metrics.transactionCount} approved transactions
            {metrics.pendingCount > 0 ? `, with ${metrics.pendingCount} still in your review queue` : ""}.
          </p>

          {/* How the business is doing */}
          <div className="bg-white rounded-xl border border-line p-4 space-y-2">
            <h3 className="font-bold text-slate-900 text-sm">How the business is doing</h3>
            <Row label="Income" value={money(metrics.income)} />
            <Row label="Expenses" value={money(metrics.expenses)} />
            <Row label="Net profit" value={money(metrics.net)} strong />
            {metrics.netMarginPct !== null && (
              <p className="text-xs text-slate-500">You keep about <span className="font-semibold">{metrics.netMarginPct}p of every {cfg.currencySymbol}1</span> of income (net margin).</p>
            )}
            {metrics.incomeConcentrationPct !== null && metrics.topIncome.length > 0 && (
              <p className="text-xs text-slate-500">Your largest income source is <span className="font-semibold">{metrics.incomeConcentrationPct}%</span> of income ({metrics.topIncome[0].category}).</p>
            )}
          </div>

          {/* Where money went */}
          {metrics.topExpenses.length > 0 && (
            <div className="bg-white rounded-xl border border-line p-4 space-y-1.5">
              <h3 className="font-bold text-slate-900 text-sm">Where your money went</h3>
              {metrics.topExpenses.map((e) => (
                <div key={e.category} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{e.category} <span className="text-ink-soft">· {e.pct}%</span></span>
                  <span className="font-semibold text-slate-800">{money(e.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Cash flow */}
          {metrics.monthly.length > 0 && (
            <div className="bg-white rounded-xl border border-line p-4 space-y-1.5">
              <h3 className="font-bold text-slate-900 text-sm">Your cash flow (last months)</h3>
              {metrics.monthly.map((m) => (
                <div key={m.month} className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{m.month}</span>
                  <span className="text-income">+{money(m.income)}</span>
                  <span className="text-expense">-{money(m.expenses)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Plain comparisons and questions: worked out on the device, no AI */}
          {entries && <WhatChanged entries={entries} today={today} money={cents} />}
          {entries && <AskYourBooks entries={entries} today={today} fy={cfg.fiscalYearStart} money={cents} yearWord={yearWord} />}

          {/* AI explanation (opt-in) */}
          <div className="bg-white rounded-xl border-2 border-brand-200 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-600" />
              <h3 className="font-bold text-slate-900 text-sm">Explain this in plain English</h3>
            </div>
            <label className="block text-xs text-slate-500">
              Model
              <select
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="mt-1 w-full border-2 border-slate-300 rounded-lg px-2 py-2 text-sm bg-white"
              >
                {modelsForRole("insights").map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={explain}
              disabled={busy}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-lg text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Thinking…</> : "Explain my numbers"}
            </button>
            <p className="text-[10px] text-ink-soft">Uses your own AI key; the cost shows in your AI spend tracker. The AI explains the figures above — it can't change or invent them.</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {narration && (
              <div className="text-sm text-slate-700 whitespace-pre-wrap border-t border-line pt-3">{narration}</div>
            )}

            {/* Follow-up questions */}
            {narration && (
              <div className="border-t border-line pt-3 space-y-3">
                {chat.map((c, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="bg-brand-50 rounded-lg rounded-tr-sm px-3 py-2 text-sm text-ink font-medium ml-6">{c.q}</div>
                    <div className="text-sm text-slate-700 whitespace-pre-wrap px-1">{c.a}</div>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") ask(); }}
                    placeholder="Ask a follow-up… e.g. why did expenses rise?"
                    className="flex-1 border border-line rounded-lg px-3 py-2 text-sm bg-white text-ink"
                  />
                  <button
                    onClick={ask}
                    disabled={asking || !question.trim()}
                    className="bg-brand-600 text-white w-10 h-10 rounded-lg flex items-center justify-center disabled:opacity-40 shrink-0"
                    aria-label="Ask"
                  >
                    {asking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-ink-soft">Answers use only your figures above — the AI won't invent numbers. Each question uses your AI key.</p>
              </div>
            )}
          </div>

          <DeadlineCalendar />

          <p className="text-[11px] text-ink-soft text-center">
            Take anything important to a qualified accountant — keeping a professional in the loop is standard practice.
          </p>
        </>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${strong ? "font-semibold text-slate-800" : "text-slate-500"}`}>{label}</span>
      <span className={`text-sm ${strong ? "font-bold text-slate-900" : "text-slate-700"}`}>{value}</span>
    </div>
  );
}
