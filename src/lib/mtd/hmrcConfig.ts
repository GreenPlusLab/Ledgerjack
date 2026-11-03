/**
 * HMRC MTD config for the LedgerJack PWA (Supabase relay version).
 *
 * All HMRC API traffic goes through your Supabase Edge Function (hmrc-relay),
 * so the app never holds the client_secret. The only direct-to-HMRC step is the
 * OAuth "authorize" page, which needs just the (non-secret) client_id.
 */

// Your deployed relay function URL. Replace <PROJECT_REF> with your Supabase
// project ref (same one your ai-proxy uses).
export const RELAY_BASE =
  "https://<PROJECT_REF>.supabase.co/functions/v1/hmrc-relay";

// Optional: if your Supabase gateway requires it, set your public anon key here
// and it will be sent as the `apikey` header. If you deployed with
// `--no-verify-jwt`, you can leave this empty.
export const SUPABASE_ANON_KEY = "";

// Keep "sandbox" until HMRC grants production access, then flip to "production".
export const HMRC_ENV: "sandbox" | "production" = "sandbox";

const AUTHORIZE_HOST = {
  sandbox: "https://test-api.service.hmrc.gov.uk",
  production: "https://api.service.hmrc.gov.uk",
}[HMRC_ENV];

// client_id is NOT secret — it is needed to build the authorize URL.
export const HMRC_CLIENT_ID = "REPLACE_WITH_YOUR_SANDBOX_CLIENT_ID";

// Must EXACTLY match a redirect URI registered on the HMRC Developer Hub.
// We use the app ROOT (not a /path) because LedgerJack has no router — the
// return is detected by the presence of ?code plus a matching saved state.
// Register BOTH of these on the Dev Hub:
//   https://ledgerjack.com        (production)
//   http://localhost:5173         (local testing)
export const REDIRECT_URI = "https://ledgerjack.com";

// Confirm exact scope strings against the APIs you subscribe to on the Dev Hub.
export const SCOPES = ["read:self-assessment", "write:self-assessment"];

export function buildAuthorizeUrl(state: string, codeChallenge: string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: HMRC_CLIENT_ID,
    scope: SCOPES.join(" "),
    redirect_uri: REDIRECT_URI,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${AUTHORIZE_HOST}/oauth/authorize?${p.toString()}`;
}
