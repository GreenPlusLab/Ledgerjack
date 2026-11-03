# LedgerJack MTD — Start Here (Supabase version, novice step-by-step)

You already run Supabase for your ai-proxy, so the MTD relay lives right beside
it as a second Edge Function. That means no new hosting to learn and no domain
changes. Everything below stays in **sandbox** (HMRC's safe test world) until
the very last phase — no real tax data or money is touched before then.

Six phases:
0. Free accounts you need
1. Create your HMRC sandbox app (get your keys)
2. Deploy the relay to Supabase (next to ai-proxy)
3. Add the client files to your app
4. Test the whole flow in sandbox
5. Apply to HMRC to go live
6. Money & legal housekeeping (small)

Golden rule: the HMRC **client_secret** never goes in any file or email. It is
only ever typed into `supabase secrets set` in Phase 2.

---

## PHASE 0 — Free accounts (~15 min)
1. **HMRC Developer Hub** account: `https://developer.service.hmrc.gov.uk`.
2. **Supabase CLI** (you likely already have it for ai-proxy). If not:
   `https://supabase.com/docs/guides/cli` — install, then `supabase login`.

---

## PHASE 1 — Your HMRC sandbox app (~30 min)
All on `https://developer.service.hmrc.gov.uk`.
1. Sign in → **Your applications** → **Add an application to the sandbox**.
   Name it "LedgerJack".
2. Open it → **Credentials**. Copy the **Client ID** and **Client secret**
   (keep the secret safe — it goes into Supabase in Phase 2, nowhere else).
3. **Redirect URIs** — add exactly:
   - `https://ledgerjack.com`
   - `http://localhost:5173`  (for local testing)

   These are the app's main address, with no `/hmrc/callback` on the end:
   LedgerJack spots the return from HMRC on its home page (see
   `src/lib/mtd/hmrcConfig.ts`).
4. **API subscriptions** — subscribe (sandbox) to the Income Tax (MTD) APIs you
   need for a free ITSA product: business details/obligations, self-employment
   and/or property updates, tax calculation, and final declaration. Note each
   API's exact **scope** strings and confirm they match `SCOPES` in hmrcConfig.ts.
5. **Sandbox users** — create a test **Individual**. Copy its user ID, password,
   and **NINO**; you'll "log in" as this fake person when testing.

---

## PHASE 2 — Deploy the relay to Supabase (~20 min)
1. Copy `supabase/functions/hmrc-relay/index.ts` from the download into your repo
   at the same path (next to `supabase/functions/ai-proxy/`).
2. Open the file and check `ALLOWED_ORIGINS` lists your real app origins.
3. Set the secrets (typed in your terminal, stored encrypted by Supabase):
   ```
   supabase secrets set HMRC_CLIENT_ID=your_sandbox_client_id
   supabase secrets set HMRC_CLIENT_SECRET=your_sandbox_client_secret
   supabase secrets set HMRC_ENV=sandbox APP_VERSION=0.1.0 VENDOR_PUBLIC_IP=0.0.0.0
   ```
4. Deploy with JWT verification OFF (so the proxy is publicly callable, exactly
   like a normal API relay):
   ```
   supabase functions deploy hmrc-relay --no-verify-jwt
   ```
5. Test it. Your function URL is:
   `https://<PROJECT_REF>.supabase.co/functions/v1/hmrc-relay/health`
   Open it in a browser — you should see `{"ok":true,"env":"sandbox"}`.
   (If your project blocks unauthenticated calls, add your public anon key as an
   `apikey` header, and set `SUPABASE_ANON_KEY` in hmrcConfig.ts.)

---

## PHASE 3 — Add the client files (see WHERE-EACH-FILE-GOES.md)
1. Copy the `src/lib/mtd/` folder and the `src/views/mtd/` folder into your app.
2. In `src/lib/mtd/hmrcConfig.ts` set:
   - `RELAY_BASE` → replace `<PROJECT_REF>` with your Supabase project ref
   - `HMRC_CLIENT_ID` → your sandbox Client ID
   - confirm `SCOPES` and `REDIRECT_URI`
3. Already done: `src/App.tsx` spots the return from HMRC on the home page
   (`?code` plus the saved `state`) and shows `HmrcCallback.tsx`. No route needed.
4. Put `<ConnectHmrc />` inside your Settings screen, shown only when `showMTD`
   is true (consistent with Session 00g).
5. For the actual MTD screens (obligations, quarterly update, calculation, final
   declaration), hand `session-11-mtd-hmrc.md` + these files to your coding
   assistant. Every call goes through `callHmrc()` in `hmrcClient.ts`.

Note: the vault must be **unlocked** when connecting, because tokens are stored
with your operational key (same as your API key).

---

## PHASE 4 — Test in sandbox (thorough)
1. Run locally (`http://localhost:5173`). Unlock the vault. In Settings, tap
   **Connect to HMRC**, sign in as your sandbox test user, approve. You should
   land on the callback page and end up "Connected ✓".
2. Exercise the journey: obligations → quarterly update → calculation → final
   declaration, all in sandbox.
3. Use the `Gov-Test-Scenario` option in `callHmrc` to test failures HMRC lists:
   validation errors, no obligations, rate limits, expired token → refresh.
4. **Validate fraud headers** with HMRC's **Test Fraud Prevention Headers API**
   on the Developer Hub and fix anything it flags (especially the vendor-IP
   placeholder in the relay). Get this clean before Phase 5.

---

## PHASE 5 — Apply to go live (start early — takes weeks)
1. On the Developer Hub, work through **Get production credentials** and the
   **Production Approvals Checklist**. Confirm you meet the **minimum
   functionality standards** for a free Income Tax product; your Phase 4 testing
   is the evidence.
2. Expect a demo and some back-and-forth. Raise early that you're a free product
   using a hosted relay to hold the secret, so it isn't a surprise at the end.
3. When approved you get production keys. Then, and only then:
   ```
   supabase secrets set HMRC_ENV=production
   supabase secrets set HMRC_CLIENT_ID=your_prod_id HMRC_CLIENT_SECRET=your_prod_secret
   supabase functions deploy hmrc-relay --no-verify-jwt
   ```
   and set `HMRC_ENV = "production"` + the production Client ID in hmrcConfig.ts.
   Do one small real submission to confirm before announcing.

---

## PHASE 6 — Money & legal (small)
- **Hosting:** Supabase Edge Functions — you already pay for/run this. ~£0 extra.
- **ICO data protection fee:** the relay handles figures in transit, so you're
  likely a data processor. If you already registered for the AI proxy, you're
  covered; if not, Tier 1 is ~**£52/year (£47 by direct debit)** at
  `https://ico.org.uk` — use their free self-assessment to confirm.
- **Privacy policy:** add a couple of lines that the MTD relay stores nothing and
  only forwards required figures + HMRC's mandated headers. It's a selling point.

Comfortably inside your £150/year, most of which stays as buffer.

---

## The three things most likely to trip you up
1. **Redirect URI mismatch** — must match Phase 1 exactly (https + path).
2. **Fraud headers** not passing HMRC's checker (Phase 4, step 4).
3. **Vault locked** during connect — unlock first, since tokens are encrypted.
