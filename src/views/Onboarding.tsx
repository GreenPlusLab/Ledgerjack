import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronRight, Check, Search, X, Download, Eye, EyeOff, Lock, ShieldOff } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useCrypto } from '../contexts/CryptoContext';
import { COUNTRY_REGIONS, TAX_REGIONS, detectRegionFromBrowser, getFlagEmoji, type TaxRegionConfig } from '../lib/regions';
import { db, requestStoragePersistence } from '../lib/db';
import { APP_MOTTO } from '../lib/brand';
import RecoveryKeyCheck from '../components/privacy/RecoveryKeyCheck';
import Waiter from '../components/privacy/Waiter';
import { saveChoice } from '../lib/privacy/store';
import { recoveryFileBody } from '../lib/privacy/recoverySheet';
import { downloadFile } from '../lib/backup';
import type { PrivacyChoice } from '../lib/privacy/choices';

interface OnboardingProps {
  onComplete: () => void;
}

// ── Light animated wave background ────────────────────────────────────────────
function WaveBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <svg
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <radialGradient id="rg1" cx="25%" cy="30%" r="55%">
            <stop offset="0%" stopColor="#bbf7d0" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#f0fdf4" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="rg2" cx="80%" cy="75%" r="50%">
            <stop offset="0%" stopColor="#dcfce7" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#f0fdf4" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="#f0fdf4" />
        <rect width="100%" height="100%" fill="url(#rg1)" />
        <rect width="100%" height="100%" fill="url(#rg2)" />

        <path className="wave-path wave-1" fill="none" stroke="#16a34a" strokeWidth="1" strokeOpacity="0.10"
          d="M-200,200 C0,100 200,300 400,200 S800,100 1000,200 S1400,300 1600,200" />
        <path className="wave-path wave-2" fill="none" stroke="#22c55e" strokeWidth="0.7" strokeOpacity="0.08"
          d="M-200,350 C0,250 200,450 400,350 S800,250 1000,350 S1400,450 1600,350" />
        <path className="wave-path wave-3" fill="none" stroke="#4ade80" strokeWidth="0.6" strokeOpacity="0.07"
          d="M-200,500 C0,400 200,600 400,500 S800,400 1000,500 S1400,600 1600,500" />
        <path className="wave-path wave-4" fill="none" stroke="#16a34a" strokeWidth="0.5" strokeOpacity="0.06"
          d="M-200,150 C100,50 300,250 600,150 S1000,50 1200,150 S1500,250 1700,150" />
        <path className="wave-path wave-5" fill="none" stroke="#86efac" strokeWidth="0.4" strokeOpacity="0.05"
          d="M-200,650 C100,550 300,750 600,650 S1000,550 1200,650 S1500,750 1700,650" />
      </svg>

      {/* Subtle dot grid */}
      <div className="absolute inset-0 opacity-[0.025]"
        style={{ backgroundImage: 'radial-gradient(#16a34a 1px,transparent 1px)', backgroundSize: '32px 32px' }} />

      <div className="particle p1" style={{ background: '#22c55e' }} />
      <div className="particle p2" style={{ background: '#16a34a' }} />
      <div className="particle p3" style={{ background: '#4ade80' }} />
      <div className="particle p4" style={{ background: '#22c55e' }} />
      <div className="particle p5" style={{ background: '#86efac' }} />
    </div>
  );
}

// ── Glowing shield logo ────────────────────────────────────────────────────────
function ShieldLogo({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  const dim = size === 'lg' ? 80 : 52;
  return (
    <div className="relative mx-auto" style={{ width: dim, height: dim }}>
      <div className="absolute inset-0 rounded-2xl bg-brand-400 blur-xl opacity-30 animate-pulse-slow" />
      <div className="relative w-full h-full flex items-center justify-center">
        <svg width={dim} height={dim} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="shieldGrad" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#4ade80" />
              <stop offset="50%" stopColor="#22c55e" />
              <stop offset="100%" stopColor="#15803d" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <path d="M40 8 L68 18 L68 42 C68 57 55 68 40 72 C25 68 12 57 12 42 L12 18 Z"
            fill="#f0fdf4" stroke="url(#shieldGrad)" strokeWidth="2" filter="url(#glow)" />
          <path d="M40 14 L62 22 L62 42 C62 54 52 63 40 67 C28 63 18 54 18 42 L18 22 Z"
            fill="url(#shieldGrad)" opacity="0.12" />
          <line x1="27" y1="34" x2="53" y2="34" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
          <line x1="27" y1="40" x2="53" y2="40" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round" opacity="0.65" />
          <line x1="27" y1="46" x2="45" y2="46" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round" opacity="0.45" />
          <text x="40" y="44" textAnchor="middle" fill="#15803d" fontSize="10" fontWeight="bold" fontFamily="monospace" opacity="0.5">LJ</text>
        </svg>
      </div>
    </div>
  );
}

// ── Vault boot animation ───────────────────────────────────────────────────────
function VaultAnimation({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState(0);
  const steps = [
    'LedgerJack: Allocating secure memory sandbox...',
    'LedgerJack: Initializing Web Crypto API...',
    'LedgerJack: Seeding local IndexedDB storage...',
    'Vault ready.',
  ];

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const advance = (i: number) => {
      if (i >= steps.length) { onDone(); return; }
      setPhase(i);
      t = setTimeout(() => advance(i + 1), i === steps.length - 1 ? 600 : 350);
    };
    advance(0);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen relative">
      <WaveBackground />
      <div className="relative z-10 flex flex-col items-center gap-6">
        <ShieldLogo size="lg" />
        <div className="text-center space-y-2">
          {steps.map((s, i) => (
            <div key={s}
              className={`flex items-center gap-2 transition-all duration-300 ${i <= phase ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${i < phase ? 'bg-brand-500' : i === phase ? 'bg-brand-500 animate-pulse' : 'bg-slate-300'}`} />
              <span className={`text-sm font-mono ${i < phase ? 'text-brand-600' : i === phase ? 'text-brand-700' : 'text-ink-soft'}`}>{s}</span>
            </div>
          ))}
        </div>
        <div className="w-48 h-0.5 bg-slate-200 rounded-full overflow-hidden mt-2">
          <div
            className="h-full bg-gradient-to-r from-brand-500 to-brand-400 rounded-full transition-all duration-300"
            style={{ width: `${((phase + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Typewriter hook ────────────────────────────────────────────────────────────
function useTypewriter(texts: string[], speed = 40) {
  const [displayed, setDisplayed] = useState('');
  const [textIdx, setTextIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [pausing, setPausing] = useState(false);

  useEffect(() => {
    if (pausing) {
      const t = setTimeout(() => {
        setPausing(false);
        setTextIdx((i) => (i + 1) % texts.length);
        setCharIdx(0);
      }, 2200);
      return () => clearTimeout(t);
    }
    if (charIdx <= texts[textIdx].length) {
      const t = setTimeout(() => {
        setDisplayed(texts[textIdx].slice(0, charIdx));
        if (charIdx === texts[textIdx].length) setPausing(true);
        else setCharIdx((c) => c + 1);
      }, speed);
      return () => clearTimeout(t);
    }
  }, [charIdx, textIdx, pausing, texts, speed]);

  return displayed;
}

// ── Status badge ───────────────────────────────────────────────────────────────
function StatusBadge({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold border border-brand-200 bg-white/80 text-brand-700 shadow-sm backdrop-blur-sm">
      <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
      {label}
    </div>
  );
}

// ── Country combobox ───────────────────────────────────────────────────────────
function CountryCombobox({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = TAX_REGIONS[value];

  const filtered = query.trim()
    ? COUNTRY_REGIONS.filter((r) =>
        r.label.toLowerCase().includes(query.toLowerCase()) ||
        r.currencyCode.toLowerCase().includes(query.toLowerCase()))
    : COUNTRY_REGIONS;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (id: string) => {
    onChange(id);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="w-full flex items-center gap-3 px-4 py-3.5 bg-white border border-line hover:border-brand-400 rounded-xl text-left transition-all shadow-sm"
      >
        <span className="text-xl leading-none">{getFlagEmoji(selected?.countryCode ?? 'XX')}</span>
        <div className="flex-1 min-w-0">
          <div className="text-slate-900 font-semibold text-sm truncate">{selected?.label ?? 'Select country…'}</div>
          {selected && (
            <div className="text-slate-500 text-xs mt-0.5">
              {selected.currencySymbol} {selected.currencyCode} &middot; FY {monthName(selected.fiscalYearStart.month)} {selected.fiscalYearStart.day}
            </div>
          )}
        </div>
        <ChevronRight className={`w-4 h-4 text-ink-soft flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-line rounded-xl shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-line">
            <Search className="w-3.5 h-3.5 text-ink-soft flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country or currency…"
              className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-ink-soft outline-none"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-ink-soft hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="max-h-56 overflow-y-auto overscroll-contain">
            {filtered.length === 0 ? (
              <div className="px-4 py-4 text-sm text-slate-500 text-center">No results</div>
            ) : filtered.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => select(r.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${r.id === value ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
              >
                <span className="text-base leading-none w-6 flex-shrink-0">{getFlagEmoji(r.countryCode)}</span>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium truncate ${r.id === value ? 'text-brand-700' : 'text-slate-800'}`}>{r.label}</div>
                  <div className="text-[10px] text-ink-soft truncate">{r.currencySymbol} {r.currencyCode} &middot; {r.mileageUnit === 'miles' ? 'Miles' : 'KM'}</div>
                </div>
                {r.id === value && <Check className="w-3.5 h-3.5 text-brand-500 flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function monthName(m: number) {
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1];
}

// ── Gradient pill button ───────────────────────────────────────────────────────
function GradientButton({
  onClick, disabled, children, icon, className = '',
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  const handleClick = () => {
    if ('vibrate' in navigator) navigator.vibrate(10);
    onClick();
  };
  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`relative flex items-center justify-center gap-2 px-6 py-3.5 rounded-full font-bold text-white text-sm
        bg-gradient-to-r from-brand-600 via-brand-500 to-brand-600 bg-[length:200%_100%]
        hover:bg-[position:100%_0] transition-all duration-500
        shadow-lg shadow-brand-200 hover:shadow-brand-300 hover:scale-[1.02]
        disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100
        ${className}`}
    >
      {children}
      {icon}
    </button>
  );
}

function downloadRecoveryKeyFile(mdkBase64: string) {
  downloadFile(recoveryFileBody(mdkBase64), `ledgerjack-recovery-key-${new Date().toISOString().slice(0, 10)}.txt`, 'text/plain');
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Onboarding({ onComplete }: OnboardingProps) {
  const [booting, setBooting] = useState(true);
  const [step, setStep] = useState(0);
  const [regionId, setRegionId] = useState<string>(() => detectRegionFromBrowser());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [completing, setCompleting] = useState(false);

  // Vault step state
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);

  const { setRegion: saveRegion } = useApp();
  const { initializeVault } = useCrypto();

  const handleBootDone = useCallback(() => setBooting(false), []);

  const subheads = [
    'LedgerJack: Zero-knowledge tax ledger...',
    'LedgerJack: Built 100% offline for the job site...',
    'Ready to secure your local ledger.',
  ];
  const typewriterText = useTypewriter(subheads, 38);

  const selectedConfig: TaxRegionConfig = TAX_REGIONS[regionId] ?? TAX_REGIONS['generic'];

  const handleRegionSelect = async () => {
    setLoading(true);
    try {
      await requestStoragePersistence();
      saveRegion(regionId);
      const cfg = TAX_REGIONS[regionId] ?? TAX_REGIONS['generic'];
      await db.accounts.bulkAdd(cfg.accounts.map((a) => ({ ...a, id: a.name })));
      await db.settings.put({ key: 'onboarding_complete', value: 'true' });
      setStep(1);
    } catch {
      setError('Setup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVaultSetup = async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const key = await initializeVault(password);
      // Safety net: a copy is downloaded straight away, then the next step
      // offers print / password app and checks the person really kept it.
      downloadRecoveryKeyFile(key);
      setRecoveryKey(key);
      setPassword('');
      setConfirmPassword('');
      setStep(2);
    } catch {
      setError('Vault initialization failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkipVault = () => {
    setError('');
    setStep(3);
  };

  const handleKeyChecked = () => {
    setRecoveryKey(null); // don't keep the key in memory longer than needed
    setStep(3);
  };

  const handleChoice = async (c: PrivacyChoice) => {
    await saveChoice(c);
    setStep(4);
  };

  const handleComplete = () => {
    setCompleting(true);
    setTimeout(() => onComplete(), 600);
  };

  if (booting) return <VaultAnimation onDone={handleBootDone} />;

  const TOTAL_STEPS = 5;

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 relative transition-opacity duration-500 ${completing ? 'opacity-0' : 'opacity-100'}`}>
      <WaveBackground />

      <div className="relative z-10 w-full max-w-md">
        {/* Header row: brand left, status badges right */}
        <div className="flex items-center justify-between mb-5 gap-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-shrink-0">
              <div className="absolute inset-0 rounded-lg bg-brand-400 blur-md opacity-25 animate-pulse-slow" />
              <div className="relative w-8 h-8 rounded-lg bg-white border border-brand-200 shadow-sm flex items-center justify-center overflow-hidden">
                <svg width="22" height="22" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="miniGrad" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#4ade80" />
                      <stop offset="100%" stopColor="#15803d" />
                    </linearGradient>
                  </defs>
                  <path d="M40 8 L68 18 L68 42 C68 57 55 68 40 72 C25 68 12 57 12 42 L12 18 Z"
                    fill="none" stroke="url(#miniGrad)" strokeWidth="3" />
                  <line x1="27" y1="34" x2="53" y2="34" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" />
                  <line x1="27" y1="42" x2="45" y2="42" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </div>
            </div>
            <span className="text-base font-bold text-slate-900 tracking-tight">LedgerJack</span>
          </div>
          <div className="flex gap-1.5 flex-wrap justify-end">
            <StatusBadge label="WebCrypto Active" />
            <StatusBadge label="IndexedDB Ready" />
          </div>        </div>

        <p className="text-center text-xs font-medium text-slate-500 mb-4 -mt-2">{APP_MOTTO}</p>

        {/* Card */}
        <div className="bg-white/90 backdrop-blur-xl border border-line rounded-2xl shadow-xl shadow-slate-200/60 overflow-hidden">
          {/* Progress bar */}
          <div className="flex gap-1 p-4 pb-0">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div key={i} className="flex-1 h-1.5 rounded-full overflow-hidden bg-slate-200">
                <div className={`h-full rounded-full transition-all duration-500 ${i <= step ? 'bg-gradient-to-r from-brand-600 to-brand-400 w-full' : 'w-0'}`} />
              </div>
            ))}
          </div>

          <div className="p-6 pt-5">

            {/* ── Step 0: Country selection ── */}
            {step === 0 && (
              <div className="space-y-6">
                <div className="text-center space-y-1">
                  <ShieldLogo size="lg" />
                  <div className="pt-3">
                    <p className="text-[11px] font-bold text-brand-600 uppercase tracking-[0.2em] mb-1">Free, private, AI-powered bookkeeping</p>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight leading-none">LedgerJack</h1>
                    <p className="text-slate-500 text-sm font-medium mt-1.5">Your Money. Your Device. Total Privacy.</p>
                    <p className="text-brand-600 text-xs font-mono mt-2 min-h-[1rem]">
                      {typewriterText}<span className="animate-pulse opacity-60">▌</span>
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Select your country</label>
                  <CountryCombobox value={regionId} onChange={setRegionId} />
                </div>

                {/* Region preview chip */}
                <div className="bg-brand-50 border border-brand-200 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-brand-100 border border-brand-300 flex items-center justify-center flex-shrink-0">
                    <span className="text-brand-700 text-xs font-bold font-mono">{selectedConfig.currencySymbol}</span>
                  </div>
                  <div className="flex-1 min-w-0 text-xs text-slate-500 leading-relaxed">
                    <span className="text-slate-800 font-semibold">{selectedConfig.label}</span>
                    {' · '}FY {monthName(selectedConfig.fiscalYearStart.month)} {selectedConfig.fiscalYearStart.day}
                  </div>
                </div>

                {error && <p className="text-red-600 text-sm font-medium">{error}</p>}
                <GradientButton onClick={handleRegionSelect} disabled={loading} icon={!loading ? <ChevronRight className="w-5 h-5" /> : undefined} className="w-full">
                  {loading ? 'Setting up…' : 'Continue'}
                </GradientButton>
              </div>
            )}

            {/* ── Step 1: Vault / password setup ── */}
            {step === 1 && (
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-100 border border-brand-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Lock className="w-5 h-5 text-brand-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 tracking-tight">Secure your ledger</h2>
                    <p className="text-slate-500 text-sm mt-0.5">Set a password to lock your data on this phone. You'll get a recovery key next, in case you forget it.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Password</label>
                    <div className="relative">
                      <input
                        type={showPass ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setError(''); }}
                        placeholder="Minimum 8 characters"
                        className="w-full px-4 py-3 pr-11 border border-line focus:border-brand-400 rounded-xl text-sm text-slate-900 placeholder:text-ink-soft outline-none transition-colors bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft hover:text-slate-600 transition-colors"
                      >
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Confirm password</label>
                    <div className="relative">
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                        placeholder="Repeat exactly"
                        className="w-full px-4 py-3 pr-11 border border-line focus:border-brand-400 rounded-xl text-sm text-slate-900 placeholder:text-ink-soft outline-none transition-colors bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft hover:text-slate-600 transition-colors"
                      >
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 leading-relaxed">
                  <strong>Zero-knowledge:</strong> Your data never leaves this device. The recovery key file is your only fallback if you forget your password — store it somewhere safe.
                </div>

                {error && <p className="text-red-600 text-sm font-medium">{error}</p>}

                <GradientButton
                  onClick={handleVaultSetup}
                  disabled={loading}
                  icon={!loading ? <Download className="w-4 h-4" /> : undefined}
                  className="w-full"
                >
                  {loading ? 'Locking your ledger…' : 'Lock my ledger'}
                </GradientButton>

                <button
                  onClick={handleSkipVault}
                  className="w-full flex items-center justify-center gap-1.5 text-ink-soft hover:text-slate-600 text-xs font-medium py-1 transition-colors"
                >
                  <ShieldOff className="w-3.5 h-3.5" />
                  Skip encryption for now
                </button>
              </div>
            )}

            {/* ── Step 2: Save and check the recovery key ── */}
            {step === 2 && recoveryKey && (
              <div className="space-y-3">
                <p className="text-xs text-brand-700 font-medium">A copy of your recovery key has been downloaded to this device.</p>
                <RecoveryKeyCheck recoveryKey={recoveryKey} onDone={handleKeyChecked} />
              </div>
            )}

            {/* ── Step 3: The waiter: how LedgerJack should work for you ── */}
            {step === 3 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-brand-700">A few quick questions so LedgerJack works the way you want. You can change your answers any time.</p>
                <Waiter onChoose={handleChoice} />
              </div>
            )}

            {/* ── Step 4: Done ── */}
            {step === 4 && (
              <div className="space-y-6 text-center">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-24 h-24 rounded-full bg-brand-400/20 animate-ping-slow" />
                  </div>
                  <div className="relative w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-200">
                    <Check className="w-10 h-10 text-white stroke-[2.5]" />
                  </div>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 tracking-tight">All Set!</h2>
                  <p className="text-slate-500 mt-2 text-sm">
                    Your ledger is ready. Start logging income, expenses, and mileage. You can configure or change your encryption any time from Settings.
                  </p>
                </div>
                <GradientButton onClick={handleComplete} className="w-full">
                  Go to Dashboard
                </GradientButton>
              </div>
            )}

          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-center text-ink-soft text-[10px] mt-4 px-4 leading-relaxed">
          LedgerJack is a pre-accounting organization utility only and does not provide certified professional tax advice.
          Data is encrypted locally and is the user's sole responsibility.
        </p>
      </div>
    </div>
  );
}
