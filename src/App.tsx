// FIX #2 (wiring) — AppProvider now receives the crypto helpers from CryptoContext
// so the API key can be encrypted/decrypted via the vault MDK.
// After the vault unlocks, reloadApiKey() is called to decrypt and surface the key.

import { useState, useEffect } from 'react';
import { CryptoProvider, useCrypto } from './contexts/CryptoContext';
import { AppProvider, type CryptoHelpers } from './contexts/AppContext';
import { SessionProvider, useSession } from './contexts/SessionContext';
import { db, initDB } from './lib/db';
import Navigation, { type View } from './components/Navigation';
import Onboarding from './views/Onboarding';
import LockScreen from './views/LockScreen';
import Dashboard from './views/Dashboard';
import TransactionEntry from './views/TransactionEntry';
import PendingReview from './views/PendingReview';
import FileCabinet from './views/FileCabinet';
import Reports from './views/Reports';
import MileageLogger from './views/MileageLogger';
import Settings from './views/Settings';
import HmrcCallback from './views/mtd/HmrcCallback';
import MtdHub from './views/mtd/MtdHub';
import Support from './views/Support';
import ManualFaq from './views/ManualFaq';
import JobEstimator from './views/JobEstimator';
import TaxPotView from './views/TaxPot';
import HealthCheck from './views/HealthCheck';
import BooksCheck from './views/BooksCheck';
import ProvisionalFigures from './views/ProvisionalFigures';
import ReportProblem from './views/ReportProblem';
import Insights from './views/Insights';
import Statements from './views/Statements';
import RulesManager from './views/RulesManager';
import RecurringManager from './views/RecurringManager';
import BudgetsManager from './views/BudgetsManager';
import TradesManager from './views/TradesManager';
import CisPayment from './views/CisPayment';
import Invoices from './views/Invoices';
import ClientBook from './views/ClientBook';
import RecurringInvoices from './views/RecurringInvoices';
import VatHub from './views/vat/VatHub';
import BankReconcile from './views/BankReconcile';
import BulkReceipts from './views/BulkReceipts';
import CloudBackup from './views/CloudBackup';
import AccountantView from './views/AccountantView';
import TrustView from './views/TrustView';
import { processRecurringInvoices } from './lib/invoices/recurringInvoices';
import { processRecurring } from './lib/recurring/recurring';

function AppContent() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [onboarded, setOnboarded]     = useState<boolean | null>(null);
  const [dbReady, setDbReady]         = useState(false);
  const [pendingHmrc, setPendingHmrc] = useState(false);

  const { isUnlocked, hasVault, encryptString_, decryptString_ } = useCrypto();
  const { isLocked } = useSession();

  // Build the CryptoHelpers bag whenever the vault is unlocked
  const cryptoHelpers: CryptoHelpers | undefined = isUnlocked
    ? { encrypt: encryptString_, decrypt: decryptString_ }
    : undefined;

  useEffect(() => {
    (async () => {
      await initDB();
      setDbReady(true);
      const setting = await db.settings.get('onboarding_complete');
      setOnboarded(setting?.value === 'true');
    })();
  }, []);

  // Detect the HMRC OAuth return. The redirect URI is the app root, so a return
  // is a page load carrying ?code plus a `state` we saved before redirecting.
  // We stash them (sessionStorage survives the reload) and finish the exchange
  // once the vault is unlocked (see the <HmrcCallback> render below).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const code = q.get('code');
    const savedState = sessionStorage.getItem('mtd_oauth_state');
    if (code && savedState) {
      sessionStorage.setItem('mtd_cb_code', code);
      if (q.get('state')) sessionStorage.setItem('mtd_cb_state', q.get('state') as string);
      if (q.get('error')) sessionStorage.setItem('mtd_cb_error', q.get('error') as string);
      window.history.replaceState({}, '', window.location.pathname);
      setPendingHmrc(true);
    } else if (sessionStorage.getItem('mtd_cb_code')) {
      setPendingHmrc(true);
    }
  }, []);

  // Create any due recurring transactions once the vault is open.
  // Guarded by the Web Locks API so two open tabs can't both post the same items.
  useEffect(() => {
    if (dbReady && (!hasVault || isUnlocked)) {
      const run = async () => {
        await processRecurring().catch(() => { /* best-effort */ });
        await processRecurringInvoices().catch(() => { /* best-effort */ });
      };
      if (typeof navigator !== 'undefined' && 'locks' in navigator) {
        (navigator as any).locks
          .request('ledgerjack-recurring', { ifAvailable: true }, async (lock: unknown) => {
            if (lock) await run();
          })
          .catch(() => { /* best-effort */ });
      } else {
        run();
      }
    }
  }, [dbReady, hasVault, isUnlocked]);

  if (!dbReady || onboarded === null) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!onboarded) {
    return (
      <AppProvider crypto={cryptoHelpers}>
        <Onboarding onComplete={() => setOnboarded(true)} />
      </AppProvider>
    );
  }

  if (hasVault && (isLocked || !isUnlocked)) {
    return <LockScreen />;
  }

  // Finish the HMRC connection (runs only once unlocked, so the vault key is
  // available to encrypt the tokens).
  if (pendingHmrc) {
    return (
      <HmrcCallback
        onDone={() => {
          setPendingHmrc(false);
          setCurrentView('settings');
        }}
      />
    );
  }

  return (
    // Pass cryptoHelpers so AppProvider can encrypt/decrypt the API key
    <AppProvider crypto={cryptoHelpers}>
      <div className="min-h-screen bg-paper">
        <header className="bg-white border-b-2 border-brand-500 px-4 py-3 sticky top-0 z-40 shadow-sm">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-brand-500 rounded-md flex items-center justify-center">
                <span className="text-white text-sm font-bold">LJ</span>
              </div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">LedgerJack</h1>
            </div>
            <span className="text-[10px] text-brand-600 font-bold uppercase tracking-widest">Encrypted</span>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-4">
          {currentView === 'dashboard'       && <Dashboard onNavigate={(v) => setCurrentView(v as View)} />}
          {currentView === 'new-transaction' && <TransactionEntry />}
          {currentView === 'pending'         && <PendingReview />}
          {currentView === 'file-cabinet'    && <FileCabinet onBack={() => setCurrentView('settings')} />}
          {currentView === 'reports'         && <Reports />}
          {currentView === 'mileage'         && <MileageLogger />}
          {currentView === 'settings'        && <Settings onNavigate={setCurrentView} />}
          {currentView === 'mtd'             && <MtdHub onBack={() => setCurrentView('settings')} />}
          {currentView === 'support'         && <Support onBack={() => setCurrentView('settings')} />}
          {currentView === 'manual'          && <ManualFaq onBack={() => setCurrentView('settings')} />}
          {currentView === 'job-estimator'   && <JobEstimator onBack={() => setCurrentView('settings')} />}
          {currentView === 'tax-pot'         && <TaxPotView onBack={() => setCurrentView('settings')} />}
          {currentView === 'health'          && <HealthCheck onBack={() => setCurrentView('settings')} onNavigate={(v) => setCurrentView(v as View)} />}
          {currentView === 'provisional'     && <ProvisionalFigures onBack={() => setCurrentView('settings')} />}
          {currentView === 'report'          && <ReportProblem onBack={() => setCurrentView('settings')} onNavigate={(v) => setCurrentView(v as View)} />}
          {currentView === 'insights'        && <Insights onBack={() => setCurrentView('dashboard')} />}
          {currentView === 'books-check'     && <BooksCheck onBack={() => setCurrentView('dashboard')} onNavigate={(v) => setCurrentView(v as View)} />}
          {currentView === 'statements'      && <Statements onBack={() => setCurrentView('settings')} />}
          {currentView === 'rules'           && <RulesManager onBack={() => setCurrentView('settings')} />}
          {currentView === 'recurring'       && <RecurringManager onBack={() => setCurrentView('settings')} />}
          {currentView === 'budgets'         && <BudgetsManager onBack={() => setCurrentView('settings')} />}
          {currentView === 'trades'          && <TradesManager onBack={() => setCurrentView('settings')} />}
          {currentView === 'cis'             && <CisPayment onBack={() => setCurrentView('settings')} />}
          {currentView === 'invoices'        && <Invoices onBack={() => setCurrentView('dashboard')} onNavigate={setCurrentView} />}
          {currentView === 'clients'         && <ClientBook onBack={() => setCurrentView('invoices')} />}
          {currentView === 'invoices-recurring' && <RecurringInvoices onBack={() => setCurrentView('invoices')} />}
          {currentView === 'vat'             && <VatHub onBack={() => setCurrentView('settings')} />}
          {currentView === 'bank'            && <BankReconcile onBack={() => setCurrentView('settings')} />}
          {currentView === 'bulk-receipts'   && <BulkReceipts onBack={() => setCurrentView('dashboard')} />}
          {currentView === 'cloud-backup'    && <CloudBackup onBack={() => setCurrentView('dashboard')} />}
          {currentView === 'accountant'      && <AccountantView onBack={() => setCurrentView('dashboard')} />}
          {currentView === 'trust'           && <TrustView onBack={() => setCurrentView('settings')} onOpenBackup={() => setCurrentView('cloud-backup')} />}
        </main>

        <Navigation currentView={currentView} onNavigate={setCurrentView} />
      </div>
    </AppProvider>
  );
}

export default function App() {
  return (
    <CryptoProvider>
      <SessionProvider>
        <AppContent />
      </SessionProvider>
    </CryptoProvider>
  );
}
