/**
 * vatApi — VAT (MTD) bridge. Reuses the same relay + tokens as income-tax MTD.
 * The 9-box field names are HMRC's own (confirmed against the hmrc/vat-api repo
 * and community client libraries).
 *
 * CONFIRM the endpoint paths/version against the HMRC VAT (MTD) OpenAPI before
 * production — they're centralised here for a one-place fix. Sandbox-first.
 */

import { recordLeft } from "../privacy/store";
import { callHmrc } from "../mtd/hmrcClient";
import { loadVrn } from "../mtd/mtdVault";

const ACCEPT = "application/vnd.hmrc.1.0+json";

async function vrn(): Promise<string> {
  const v = await loadVrn();
  if (!v) throw new Error("vrn_missing");
  return v;
}

export interface VatObligation {
  periodKey: string;
  start: string;
  end: string;
  due: string;
  status: "O" | "F" | string;
}

export async function getVatObligations(from: string, to: string, scenario?: string): Promise<VatObligation[]> {
  const v = await vrn();
  const res = await callHmrc({
    method: "GET",
    path: `/organisations/vat/${v}/obligations?from=${from}&to=${to}`,
    acceptVersion: ACCEPT,
    govTestScenario: scenario,
  });
  if (res.status >= 400) throw new Error(`vat_obligations_${res.status}`);
  const data = res.data as any;
  return (data?.obligations ?? []).map((o: any) => ({
    periodKey: o.periodKey,
    start: o.start,
    end: o.end,
    due: o.due,
    status: o.status,
  }));
}

/** The nine boxes. Box 3 and Box 5 are derived; the rest are entered. */
export interface VatReturnInput {
  periodKey: string;
  vatDueSales: number;            // box 1
  vatDueAcquisitions: number;     // box 2
  vatReclaimedCurrPeriod: number; // box 4
  totalValueSalesExVAT: number;   // box 6 (integer)
  totalValuePurchasesExVAT: number; // box 7 (integer)
  totalValueGoodsSuppliedExVAT: number; // box 8 (integer)
  totalAcquisitionsExVAT: number; // box 9 (integer)
}

export interface VatReturnPayload extends VatReturnInput {
  totalVatDue: number; // box 3 = box1 + box2
  netVatDue: number;   // box 5 = |box3 - box4|
  finalised: boolean;
}

const p2 = (n: number) => Math.round(n * 100) / 100;

/** Build the full 9-box payload, computing the two derived boxes. */
export function buildVatPayload(input: VatReturnInput, finalised: boolean): VatReturnPayload {
  const totalVatDue = p2(input.vatDueSales + input.vatDueAcquisitions);
  const netVatDue = p2(Math.abs(totalVatDue - input.vatReclaimedCurrPeriod));
  return {
    periodKey: input.periodKey,
    vatDueSales: p2(input.vatDueSales),
    vatDueAcquisitions: p2(input.vatDueAcquisitions),
    vatReclaimedCurrPeriod: p2(input.vatReclaimedCurrPeriod),
    totalVatDue,
    netVatDue,
    totalValueSalesExVAT: Math.round(input.totalValueSalesExVAT),
    totalValuePurchasesExVAT: Math.round(input.totalValuePurchasesExVAT),
    totalValueGoodsSuppliedExVAT: Math.round(input.totalValueGoodsSuppliedExVAT),
    totalAcquisitionsExVAT: Math.round(input.totalAcquisitionsExVAT),
    finalised,
  };
}

export async function submitVatReturn(payload: VatReturnPayload, scenario?: string) {
  const v = await vrn();
  const res = await callHmrc({
    method: "POST",
    path: `/organisations/vat/${v}/returns`,
    acceptVersion: ACCEPT,
    body: payload,
    govTestScenario: scenario,
  });
  if (res.status >= 200 && res.status < 300) void recordLeft("hmrc", "HMRC VAT (through the LedgerJack HMRC relay)", false);
  return res;
}
