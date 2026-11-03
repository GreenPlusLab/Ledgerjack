import { TAX_REGIONS, type TaxRegion } from './regions';

export function formatCurrency(
  amount: number,
  region: TaxRegion,
): string {
  const cfg = TAX_REGIONS[region];
  const isNegative = amount < 0;
  const abs = Math.abs(amount);
  const major = Math.floor(abs / 100);
  const minor = abs % 100;
  const formatted = `${cfg.currencySymbol}${major}.${minor.toString().padStart(2, '0')}`;
  return isNegative ? `-${formatted}` : formatted;
}

export function parseCurrencyInput(input: string): number {
  const cleaned = input.replace(/[^0-9.-]/g, '');
  const float = parseFloat(cleaned);
  if (isNaN(float)) return 0;
  const minor = Math.round(float * 100);
  // A figure too big to hold exactly in pence is treated as not a valid amount.
  return Number.isSafeInteger(minor) ? minor : 0;
}

export function formatInputValue(amount: number): string {
  return (amount / 100).toFixed(2);
}
