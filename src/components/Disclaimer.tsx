import { AlertTriangle } from 'lucide-react';

export default function Disclaimer() {
  return (
    <div className="bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 text-xs text-amber-900 flex items-start gap-2 font-medium leading-relaxed">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
      <span>
        LedgerJack organises your records. It doesn't give tax advice. Your records are kept on this device, and what goes in them is your responsibility.
      </span>
    </div>
  );
}
