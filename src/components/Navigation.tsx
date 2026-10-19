import {
  LayoutDashboard,
  FolderOpen,
  Camera,
  Receipt,
  Menu,
  Lock,
} from 'lucide-react';
import { useSession } from '../contexts/SessionContext';

export type View =
  | 'dashboard'
  | 'new-transaction'
  | 'pending'
  | 'file-cabinet'
  | 'reports'
  | 'mileage'
  | 'settings'
  | 'mtd'
  | 'support'
  | 'insights'
  | 'statements'
  | 'rules'
  | 'recurring'
  | 'budgets'
  | 'trades'
  | 'cis'
  | 'invoices'
  | 'clients'
  | 'invoices-recurring'
  | 'vat'
  | 'bank'
  | 'bulk-receipts'
  | 'cloud-backup'
  | 'accountant'
  | 'trust'
  | 'manual'
  | 'job-estimator'
  | 'tax-pot'
  | 'health'
  | 'books-check'
  | 'provisional'
  | 'report';

interface NavProps {
  currentView: View;
  onNavigate: (view: View) => void;
}

const LEFT_ITEMS: { view: View; icon: typeof LayoutDashboard; label: string }[] = [
  { view: 'dashboard', icon: LayoutDashboard, label: 'Home' },
  { view: 'pending', icon: FolderOpen, label: 'Review' },
];
const RIGHT_ITEMS: { view: View; icon: typeof LayoutDashboard; label: string }[] = [
  { view: 'invoices', icon: Receipt, label: 'Invoices' },
  { view: 'settings', icon: Menu, label: 'More' },
];

export default function Navigation({ currentView, onNavigate }: NavProps) {
  const { lockSession } = useSession();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-line z-50 safe-area-bottom shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
      <div className="max-w-lg mx-auto flex items-center justify-around py-1.5">
        {LEFT_ITEMS.map(({ view, icon: Icon, label }) => {
          const active = currentView === view;
          return (
            <button
              key={view}
              onClick={() => onNavigate(view)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${active ? 'text-brand-600' : 'text-ink-soft hover:text-brand-700'}`}
            >
              <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : ''}`} />
              <span className={`text-[10px] ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>
            </button>
          );
        })}

        {/* Central camera-first scan/add button */}
        <button
          onClick={() => onNavigate('new-transaction')}
          aria-label="Scan a receipt or add a transaction"
          className="flex flex-col items-center -mt-6"
        >
          <span className="w-14 h-14 rounded-2xl bg-brand-600 shadow-lg shadow-brand-600/40 flex items-center justify-center text-white">
            <Camera className="w-6 h-6" />
          </span>
          <span className="text-[10px] font-bold text-brand-700 mt-0.5">Scan</span>
        </button>

        {RIGHT_ITEMS.map(({ view, icon: Icon, label }) => {
          const active = currentView === view;
          return (
            <button
              key={view}
              onClick={() => onNavigate(view)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${active ? 'text-brand-600' : 'text-ink-soft hover:text-brand-700'}`}
            >
              <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : ''}`} />
              <span className={`text-[10px] ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>
            </button>
          );
        })}

        <button
          onClick={lockSession}
          className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-ink-soft hover:text-expense transition-colors"
        >
          <Lock className="w-5 h-5" />
          <span className="text-[10px] font-medium">Lock</span>
        </button>
      </div>
    </nav>
  );
}
