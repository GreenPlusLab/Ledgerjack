/**
 * ManualFaq — a plain-English guide to using LedgerJack, plus a short FAQ.
 * Static content; no data access. Reached from Settings.
 */

import { useState } from "react";
import { BookOpen, ChevronDown } from "lucide-react";

const GUIDE: { title: string; body: string }[] = [
  {
    title: "Adding money in and out",
    body: "Use Quick add on the Home screen — type it the way you'd say it, like \"20 fuel\" or \"150 client deposit\", and include a few words so it files correctly. Or tap New for a full form, where you can also photograph a receipt to have it read for you. Everything you add waits in Review until you approve it — nothing is recorded behind your back.",
  },
  {
    title: "Scanning receipts",
    body: "On the New screen, take a photo of a receipt and the AI reads the amount, date and a suggested category. You review and approve it. To scan several at once, use Bulk receipts on the Home screen. AI uses your own OpenRouter key and never invents figures.",
  },
  {
    title: "Mileage",
    body: "On the Miles screen, enter the distance and the rate you're entitled to use — check your tax authority's current rates and rules first, as eligibility varies and not everyone can claim mileage. You can also track a trip with GPS while you drive.",
  },
  {
    title: "Invoices and getting paid",
    body: "Create invoices and quotes under Invoices, save them as PDF, and share them by email, WhatsApp, or a QR code your client can scan for the payment details. You can set up recurring invoices and send reminders for overdue ones.",
  },
  {
    title: "Tax and HMRC",
    body: "The Tax pot tells you roughly how much to set aside. Provisional statements (Settings → Provisional statements) give you a P&L and, in the UK, an SA103 summary you can hand to an accountant. Making Tax Digital filing is under Settings → MTD. All figures are provisional — check them with a qualified accountant.",
  },
  {
    title: "Backups — important",
    body: "Your books live encrypted on this device. If you lose the device with no backup, they're gone. Use Settings → Backup to save a locked copy to a file, then keep it in your own cloud, on a computer or a USB stick, or on your own server. Back up your receipts too, from the File Cabinet.",
  },
  {
    title: "Your accountant",
    body: "Flag any transactions you want to discuss, then use Settings → Your accountant to download a pack (SA103 + statements + transactions) to send them.",
  },
];

const FAQ: { q: string; a: string }[] = [
  { q: "Is LedgerJack really free?", a: "Yes. Every feature is free. Contributions are voluntary and nothing is paywalled." },
  { q: "Where is my data kept?", a: "Encrypted on your device. There is no server that can read it, and your data is never sold. You choose where backups go." },
  { q: "Is this tax advice?", a: "No. LedgerJack helps you organise your books and estimate your tax. Figures are provisional — check important numbers with a qualified accountant, and confirm your obligations with HMRC." },
  { q: "What if I forget my password?", a: "Use your recovery key on the lock screen to set a new password. Without your recovery key or a backup, encrypted data can't be recovered — that's the trade-off of true privacy." },
  { q: "Does the AI cost me money?", a: "Only if you use it, and only on your own OpenRouter key. The AI panel shows your spend. You can also work entirely without AI." },
  { q: "Is it HMRC-recognised?", a: "Not yet. Don't rely on it as recognised software until it appears on GOV.UK's list." },
  { q: "Can my accountant use it?", a: "You can send them a clean pack (SA103 + statements + transactions) today. A live accountant view is planned once the optional server is available." },
];

function Item({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-line rounded-lg bg-white">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between p-3 text-left">
        <span className="text-sm font-semibold text-ink">{q}</span>
        <ChevronDown className={`w-4 h-4 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <p className="px-3 pb-3 text-sm text-ink-soft leading-relaxed">{a}</p>}
    </div>
  );
}

export default function ManualFaq({ onBack }: { onBack?: () => void }) {
  return (
    <div className="space-y-4 pb-24">
      {onBack && <button onClick={onBack} className="flex items-center gap-1 text-ink-soft font-semibold text-sm">← Back</button>}

      <div className="flex items-center gap-2">
        <BookOpen className="w-5 h-5 text-brand-600" />
        <h2 className="text-lg font-bold text-ink">Manual &amp; FAQ</h2>
      </div>

      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink-soft mb-2">How to use LedgerJack</h3>
        <div className="space-y-2">
          {GUIDE.map((g) => (
            <div key={g.title} className="bg-white rounded-lg border border-line p-3">
              <h4 className="text-sm font-bold text-ink mb-1">{g.title}</h4>
              <p className="text-sm text-ink-soft leading-relaxed">{g.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink-soft mb-2">FAQ</h3>
        <div className="space-y-2">
          {FAQ.map((f) => <Item key={f.q} q={f.q} a={f.a} />)}
        </div>
      </div>
    </div>
  );
}
