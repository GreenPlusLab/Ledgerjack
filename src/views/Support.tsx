/**
 * Support — an in-app "ask for help" chat. Answers app-usage questions from the
 * help guide using the user's own key (cheap model), with a human fallback.
 */

import { useState } from "react";
import { ArrowLeft, Send, LifeBuoy, Loader2, Flag } from "lucide-react";
import { useApp } from "../contexts/AppContext";
import { askSupport, type SupportTurn } from "../lib/ai/supportService";

// Change this to your real support address.
const SUPPORT_EMAIL = "ledgerjack.project@yahoo.com";

export default function Support({ onBack }: { onBack: () => void }) {
  const { apiKey } = useApp();
  const [turns, setTurns] = useState<SupportTurn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    const q = input.trim();
    if (!q || loading) return;
    setError(null);
    setInput("");
    const next = [...turns, { role: "user" as const, content: q }];
    setTurns(next);
    setLoading(true);
    try {
      // Send only the last few turns to keep cost down.
      const answer = await askSupport(q, apiKey, turns.slice(-4));
      setTurns([...next, { role: "assistant", content: answer }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Help is unavailable right now.");
    } finally {
      setLoading(false);
    }
  }

  const reportUrl = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
    "LedgerJack — problem report",
  )}&body=${encodeURIComponent(
    "Please describe what happened:\n\n\n---\n(You can paste any error message here.)",
  )}`;

  return (
    <div className="space-y-4 pb-28">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="p-1 -ml-1 text-slate-500"><ArrowLeft className="w-5 h-5" /></button>
        <LifeBuoy className="w-5 h-5 text-brand-600" />
        <h2 className="text-lg font-bold text-slate-900">Help &amp; support</h2>
      </div>

      {!apiKey && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
          <p className="text-sm text-amber-800">
            Add your AI key in Settings to use the help assistant. You can still report a
            problem to a human below.
          </p>
        </div>
      )}

      {turns.length === 0 && (
        <p className="text-sm text-slate-500">
          Ask how to do something in LedgerJack — for example "how do I connect to HMRC?" or
          "how do I back up my data?". This assistant helps with using the app; for tax
          questions, see your accountant.
        </p>
      )}

      <div className="space-y-2">
        {turns.map((t, i) => (
          <div
            key={i}
            className={`rounded-xl p-3 text-sm ${
              t.role === "user"
                ? "bg-brand-600 text-white ml-8"
                : "bg-white border border-line text-slate-800 mr-8"
            }`}
          >
            {t.content}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-ink-soft text-sm mr-8">
            <Loader2 className="w-4 h-4 animate-spin" /> thinking…
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="fixed bottom-20 left-0 right-0 px-4">
        <div className="max-w-md mx-auto space-y-2">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") ask(); }}
              placeholder="Ask a question about the app…"
              disabled={!apiKey}
              className="flex-1 px-3 py-2.5 border-2 border-slate-300 rounded-lg text-sm bg-white disabled:opacity-50"
            />
            <button
              onClick={ask}
              disabled={!apiKey || loading}
              className="px-4 bg-brand-600 text-white rounded-lg disabled:opacity-50"
              aria-label="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <a href={reportUrl} className="flex items-center justify-center gap-1.5 text-xs text-slate-500 font-semibold">
            <Flag className="w-3.5 h-3.5" /> Didn't help? Report a problem to a human
          </a>
        </div>
      </div>
    </div>
  );
}
