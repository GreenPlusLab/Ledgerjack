// Pure checks used by the HMRC relay (no Deno APIs, so they can be unit-tested).
//
// 1. allowedHmrcCall: the relay only forwards the HMRC calls LedgerJack makes,
//    with each part of the path in HMRC's own format. Anything else is refused,
//    so the relay can't be used as a general route into HMRC's APIs.
// 2. RateLimiter: a simple per-sender limit. Each server instance keeps its own
//    count and restarts clear it, so this slows abuse rather than stopping a
//    determined attacker; the hosting platform's own limits are the backstop.

const NINO = "[A-Z]{2}[0-9]{6}[A-D]";
const BUSINESS_ID = "X[A-Z0-9]IS[0-9]{11}";
const TAX_YEAR = "[0-9]{4}-[0-9]{2}";
const CALC_ID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const VRN = "[0-9]{9}";

const RULES: { method: string; path: RegExp; sandboxOnly?: boolean }[] = [
  // MTD Income Tax (versions in src/lib/mtd/mtdEndpoints.ts)
  { method: "GET", path: new RegExp(`^/individuals/business/details/${NINO}/list$`) },
  { method: "GET", path: new RegExp(`^/obligations/details/${NINO}/income-and-expenditure$`) },
  { method: "PUT", path: new RegExp(`^/individuals/business/self-employment/${NINO}/${BUSINESS_ID}/cumulative/${TAX_YEAR}$`) },
  { method: "POST", path: new RegExp(`^/individuals/calculations/${NINO}/self-assessment/${TAX_YEAR}/trigger/(in-year|intent-to-finalise|intent-to-amend)$`) },
  { method: "GET", path: new RegExp(`^/individuals/calculations/${NINO}/self-assessment/${TAX_YEAR}/${CALC_ID}$`) },
  { method: "POST", path: new RegExp(`^/individuals/calculations/${NINO}/self-assessment/${TAX_YEAR}/${CALC_ID}/final-declaration$`) },
  // MTD VAT
  { method: "GET", path: new RegExp(`^/organisations/vat/${VRN}/obligations$`) },
  { method: "POST", path: new RegExp(`^/organisations/vat/${VRN}/returns$`) },
  // HMRC's fraud-prevention header checker (sandbox only)
  { method: "GET", path: /^\/test\/fraud-prevention-headers\/validate$/, sandboxOnly: true },
];

/** True when `method` + `path` (the HMRC path, without the query string) is a call LedgerJack makes. */
export function allowedHmrcCall(method: string, path: string, isSandbox: boolean): boolean {
  return RULES.some((r) => r.method === method && r.path.test(path) && (!r.sandboxOnly || isSandbox));
}

export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private limit: number, private windowMs: number) {}

  /** Record a request from `key`; false when it is over the limit. */
  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.prune(now);
    return true;
  }

  private prune(now: number) {
    for (const [k, v] of this.hits) if (!v.some((t) => now - t < this.windowMs)) this.hits.delete(k);
  }
}
