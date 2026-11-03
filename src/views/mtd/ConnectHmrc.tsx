/**
 * ConnectHmrc — the "Connect to HMRC" control for the MTD settings section.
 *
 * Only render this when showMTD is true (UK sole traders / landlords), to stay
 * consistent with the Session 00g gating.
 *
 * Flow:
 *  - tap Connect -> make a PKCE verifier + state, stash them in sessionStorage,
 *    then send the browser to HMRC's authorize page.
 *  - HMRC redirects back to the app's home page; App.tsx spots ?code and shows HmrcCallback.tsx.
 */

import { useEffect, useState } from "react";
import { buildAuthorizeUrl } from "../../lib/mtd/hmrcConfig";
import { randomString, pkceChallenge } from "../../lib/mtd/oauth";
import { isConnected, clearTokens } from "../../lib/mtd/mtdVault";

const VERIFIER_KEY = "mtd_pkce_verifier";
const STATE_KEY = "mtd_oauth_state";

export default function ConnectHmrc() {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    isConnected().then(setConnected);
  }, []);

  async function startConnect() {
    const verifier = randomString();
    const state = randomString(16);
    // Keep these only for the round-trip; never put them in the URL.
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    sessionStorage.setItem(STATE_KEY, state);
    const challenge = await pkceChallenge(verifier);
    window.location.href = buildAuthorizeUrl(state, challenge);
  }

  async function disconnect() {
    await clearTokens();
    setConnected(false);
    // Tell the user they can also remove the software authorisation in their
    // HMRC online account, since we can't do that for them.
  }

  if (connected === null) {
    return <p className="text-sm text-ink-soft">Checking HMRC connection…</p>;
  }

  return (
    <div className="space-y-2">
      <h3 className="font-semibold">Making Tax Digital</h3>
      {connected ? (
        <>
          <p className="text-sm text-income">Connected to HMRC ✓</p>
          <button
            onClick={disconnect}
            className="text-sm text-slate-500 underline"
          >
            Disconnect
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-500">
            Connect once to submit your quarterly updates and final declaration.
            You'll sign in with your Government Gateway details on HMRC's own page.
          </p>
          <button
            onClick={startConnect}
            className="rounded-lg bg-teal-600 px-4 py-2 text-white"
          >
            Connect to HMRC
          </button>
        </>
      )}
    </div>
  );
}
