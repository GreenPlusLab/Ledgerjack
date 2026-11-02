import { useState } from 'react';
import { Zap, Cpu, Receipt } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { modelsForRole, getSelectedModel, setSelectedModel } from '../lib/ai/aiModels';

export default function AISettingsPanel() {
  const { apiKey, setApiKey } = useApp();

  const [apiInput, setApiInput] = useState(apiKey);
  const [saved, setSaved]       = useState(false);
  const [scanModel, setScanModel] = useState(getSelectedModel('scanning'));
  const [insightModel, setInsightModel] = useState(getSelectedModel('insights'));

  const handleSaveApiKey = () => {
    setApiKey(apiInput.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleClearApiKey = () => {
    setApiInput('');
    setApiKey('');
  };

  return (
    <div className="bg-white rounded-xl border border-line p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="w-5 h-5 text-brand-600" />
        <h3 className="font-bold text-slate-900">AI account (OpenRouter)</h3>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
          OpenRouter API Key
        </label>
        <input
          type="password"
          placeholder="sk-or-v1-..."
          value={apiInput}
          onChange={(e) => setApiInput(e.target.value)}
          className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:border-brand-500"
        />
        <div className="flex gap-2">
          <button
            onClick={handleSaveApiKey}
            disabled={!apiInput.trim()}
            className="flex-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white py-2 rounded-lg text-xs font-bold transition-colors"
          >
            {saved ? 'Saved' : 'Save Key'}
          </button>
          {apiKey && (
            <button
              onClick={handleClearApiKey}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-line text-slate-600 rounded-lg text-xs font-semibold transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* AI credits are a business cost — most people never think to claim them. */}
        <div className="bg-brand-50 border border-brand-200 rounded-lg p-2.5 flex items-start gap-2">
          <Receipt className="w-3.5 h-3.5 text-brand-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-brand-800 leading-relaxed">
            <strong>Topped up your AI credits?</strong> What you pay OpenRouter to run scanning is a cost of running your business — so keep the receipt and add it to your ledger like any other expense. Easy to forget, and it's your money. Check with your accountant if you're unsure what's claimable.
          </p>
        </div>

        <p className="text-[11px] text-slate-700 leading-relaxed bg-slate-50 border border-line rounded-lg p-2.5">
          <strong>No money for AI?</strong> A free OpenRouter account (no card needed) gives you a key too. Paste it here and pick <strong>Free online AI</strong> in Settings, Your privacy choices. LedgerJack then uses only free models, which have daily limits and may use what you send to train their AI.
        </p>

        <p className="text-[10px] text-ink-soft leading-relaxed">
          One OpenRouter key powers all AI: OpenAI models for scanning and entries,
          Anthropic (Opus 4.8 / Fable 5) for insights. Your key is stored in your
          encrypted vault, never sent to any LedgerJack server. Your figures pass
          through OpenRouter to the model — set per-model data controls in your
          OpenRouter account. Get a key at openrouter.ai.
        </p>

        {/* Two model pickers: one for scanning, one for insights */}
        <div className="pt-2 border-t border-line space-y-3">
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-ink-soft" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Choose your models</p>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-ink">Scanning receipts &amp; entries</label>
            <select
              value={scanModel}
              onChange={(e) => { setSelectedModel('scanning', e.target.value); setScanModel(e.target.value); }}
              className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-white text-ink"
            >
              {modelsForRole('scanning').map((m) => (
                <option key={m.id} value={m.id}>{m.label}{m.recommended ? ' (recommended)' : ''}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-ink">Insights &amp; explanations</label>
            <select
              value={insightModel}
              onChange={(e) => { setSelectedModel('insights', e.target.value); setInsightModel(e.target.value); }}
              className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-white text-ink"
            >
              {modelsForRole('insights').map((m) => (
                <option key={m.id} value={m.id}>{m.label}{m.recommended ? ' (recommended)' : ''}</option>
              ))}
            </select>
          </div>
          <p className="text-[10px] text-ink-soft leading-relaxed">
            Pick which model handles each job. Cheaper models cost less; premium models are more accurate on tricky receipts or deeper insights.
          </p>
        </div>
      </div>
    </div>
  );
}
