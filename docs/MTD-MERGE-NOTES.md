# MTD merge — what changed

Your app, with the free Making Tax Digital (HMRC) feature merged in. Nothing was
removed; every change is additive. Here is the complete list.

## New files (8 code + 2 guides)
- `supabase/functions/hmrc-relay/index.ts` — the zero-knowledge relay (sits next
  to your existing `ai-proxy`). Holds the HMRC secret, adds required fraud
  headers, forwards to HMRC, stores nothing.
- `src/lib/mtd/hmrcConfig.ts` — relay URL, client id, redirect URI, scopes.
- `src/lib/mtd/mtdVault.ts` — stores HMRC tokens + device id ENCRYPTED using your
  existing `crypto.ts` (`encryptTextPayload`/`decryptTextPayload`) and `db.settings`.
- `src/lib/mtd/fraudHeaders.ts` — browser-side HMRC fraud-prevention headers.
- `src/lib/mtd/oauth.ts` — PKCE + token exchange/refresh via the relay.
- `src/lib/mtd/hmrcClient.ts` — `callHmrc()`: one function every MTD screen uses;
  auto-refreshes tokens.
- `src/views/mtd/ConnectHmrc.tsx` — the "Connect to HMRC" button (Settings).
- `src/views/mtd/HmrcCallback.tsx` — completes the OAuth return.
- `docs/MTD-START-HERE.md`, `docs/MTD-WHERE-FILES-GO.md` — setup guides.

## Edited files (3, all additive)
- `src/App.tsx`
  - imported `HmrcCallback`
  - added a `pendingHmrc` state + an effect that detects the HMRC OAuth return
    (a page load with `?code` and a saved `state`), stashes it, cleans the URL
  - renders `<HmrcCallback>` once the vault is unlocked, then returns to Settings
- `src/views/Settings.tsx`
  - imported `ConnectHmrc`
  - rendered it in a new card, shown ONLY when `region === 'uk'`
- `src/lib/mtd/hmrcConfig.ts`
  - redirect URI set to the app ROOT (your app has no router), detected via
    `?code` + saved state

## You still need to fill in 3 values
1. `src/lib/mtd/hmrcConfig.ts` → `RELAY_BASE`: replace `<PROJECT_REF>` with your
   Supabase project ref.
2. `src/lib/mtd/hmrcConfig.ts` → `HMRC_CLIENT_ID`: your sandbox client id.
3. Confirm `SCOPES` match what you subscribe to on the HMRC Developer Hub.

Then follow `docs/MTD-START-HERE.md` (deploy the relay, register the redirect
URIs `https://ledgerjack.com` and `http://localhost:5173`, test in sandbox).

## Nothing runs against real HMRC yet
`HMRC_ENV` is `sandbox` everywhere. The UK-only Connect button appears in
Settings; everything else (obligations, quarterly update, calculation, final
declaration) is the next build step, using the `callHmrc()` function now in place.
