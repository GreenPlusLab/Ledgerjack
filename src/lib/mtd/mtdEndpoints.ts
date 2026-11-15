/**
 * mtdEndpoints — every HMRC ITSA path and API version in ONE place.
 *
 * Checked on 15 November 2026 against HMRC's own published API source and
 * service guide (github.com/hmrc):
 *   - business-details-api           v2.0 (the only version; 1.0 is gone)
 *   - obligations-api                v3.0
 *   - self-employment-business-api   v5.0 (cumulative period summary, 2025-26 on)
 *   - individual-calculations-api    v8.0 (7.0 is gone; 9.0 is sandbox-only)
 *   - income-tax-mtd-end-to-end-service-guide (final declaration journey)
 *
 * HMRC retires versions regularly. Re-check these before each tax year and
 * whenever HMRC's software developer newsletter announces a change.
 */

// Accept headers pin the API version.
export const ACCEPT = {
  businessDetails: "application/vnd.hmrc.2.0+json",
  obligations: "application/vnd.hmrc.3.0+json",
  selfEmployment: "application/vnd.hmrc.5.0+json",
  calculations: "application/vnd.hmrc.8.0+json",
};

/** HMRC's calculation types (individual-calculations-api v8). */
export type CalculationType = "in-year" | "intent-to-finalise" | "intent-to-amend";

const enc = encodeURIComponent;

export const endpoints = {
  // List the customer's businesses (to obtain the self-employment businessId).
  listBusinesses: (nino: string) =>
    `/individuals/business/details/${enc(nino)}/list`,

  // Income and expenditure obligations (quarterly update periods and due dates),
  // for one self-employment business.
  obligations: (nino: string, from: string, to: string, businessId?: string) => {
    const q = new URLSearchParams({ fromDate: from, toDate: to });
    if (businessId) { q.set("typeOfBusiness", "self-employment"); q.set("businessId", businessId); }
    return `/obligations/details/${enc(nino)}/income-and-expenditure?${q.toString()}`;
  },

  // Create or amend the cumulative period summary (the quarterly update).
  // Method: PUT. Covers the start of the tax year to the end of the update period.
  submitCumulative: (nino: string, businessId: string, taxYear: string) =>
    `/individuals/business/self-employment/${enc(nino)}/${enc(businessId)}/cumulative/${enc(taxYear)}`,

  // Trigger a tax calculation. Method: POST. Returns { calculationId }.
  triggerCalculation: (nino: string, taxYear: string, type: CalculationType) =>
    `/individuals/calculations/${enc(nino)}/self-assessment/${enc(taxYear)}/trigger/${type}`,

  // Retrieve a calculation. Method: GET. 404 while HMRC is still working on it.
  getCalculation: (nino: string, taxYear: string, calculationId: string) =>
    `/individuals/calculations/${enc(nino)}/self-assessment/${enc(taxYear)}/${enc(calculationId)}`,

  // Submit the final declaration for the calculation the person agreed to.
  // Method: POST. The calculation must have been triggered as intent-to-finalise.
  finalDeclaration: (nino: string, taxYear: string, calculationId: string) =>
    `/individuals/calculations/${enc(nino)}/self-assessment/${enc(taxYear)}/${enc(calculationId)}/final-declaration`,
};

/**
 * HMRC tax years are written like "2026-27". Given a date inside the year that
 * starts on 6 April, return the HMRC tax-year string.
 */
export function taxYearFor(dateIso: string): string {
  const d = new Date(dateIso + "T00:00:00");
  const y = d.getUTCFullYear();
  // UK tax year starts 6 April. Before that, we're in the (y-1)/y year.
  const startYear = (d.getUTCMonth() > 3 || (d.getUTCMonth() === 3 && d.getUTCDate() >= 6)) ? y : y - 1;
  const end = (startYear + 1).toString().slice(2);
  return `${startYear}-${end}`;
}

/** Calendar update periods end on the last day of a month (30 June, 30 Sept, 31 Dec, 31 Mar). */
function isCalendarPeriodEnd(dateIso: string): boolean {
  const md = dateIso.slice(5);
  return md === "06-30" || md === "09-30" || md === "12-31" || md === "03-31";
}

/**
 * Where a cumulative quarterly update starts. GOV.UK: "Each quarterly update
 * covers from the start of the current tax year (6 April) to the end of the
 * update period" (1 April for calendar update periods).
 *
 * We use the earliest obligation start HMRC gave for the same tax year (this
 * also covers a business that started part-way through the year), and fall
 * back to 6 April, or 1 April for calendar periods.
 */
export function cumulativeStart(
  obligation: { periodStartDate: string; periodEndDate: string },
  allObligations: { periodStartDate: string; periodEndDate: string }[] = [],
): string {
  const year = taxYearFor(obligation.periodEndDate);
  const inYear = (o: { periodStartDate: string; periodEndDate: string }) =>
    !!o.periodStartDate && !!o.periodEndDate && taxYearFor(o.periodEndDate) === year;
  const othersInYear = allObligations.filter(inYear);
  const sameYear = [obligation, ...othersInYear].map((o) => o.periodStartDate).sort();
  const startYear = year.slice(0, 4);
  const yearStart = isCalendarPeriodEnd(obligation.periodEndDate) ? `${startYear}-04-01` : `${startYear}-04-06`;
  const earliest = sameYear[0];
  if (!earliest || earliest <= yearStart) return yearStart;
  // With the year's full list from HMRC, its earliest start is the answer: a
  // later start means the business began part-way through the year.
  if (othersInYear.length > 0) return earliest;
  // With only this one obligation: a start on a normal quarter boundary is just
  // a later quarter, so the update still runs from the start of the year.
  const quarterStarts = ["07-06", "10-06", "01-06", "07-01", "10-01", "01-01"];
  return quarterStarts.includes(earliest.slice(5)) ? yearStart : earliest;
}
