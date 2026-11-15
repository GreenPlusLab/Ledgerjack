# HMRC schema used in tests

`se-cumulative-request-v5.json` is HMRC's own JSON schema for "Create or Amend a
Self-Employment Cumulative Period Summary" (self-employment-business-api v5.0),
copied on 15 November 2026 from
https://github.com/hmrc/self-employment-business-api
(resources/public/api/conf/5.0/schemas/createAmendCumulativePeriodSummary/request.json,
commit 922aab2). Copyright HM Revenue & Customs, Apache License 2.0.

`tests/mtd.test.ts` checks that what LedgerJack sends fits this schema. When
HMRC releases a new version, replace the file and update `mtdEndpoints.ts`.
