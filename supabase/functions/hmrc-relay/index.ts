// LedgerJack MTD relay — Supabase Edge Function (Deno)
// -----------------------------------------------------
// Same job as your ai-proxy: a stateless, allowlist-CORS proxy that hides a
// secret from the browser. Here the secret is the HMRC client_secret.
//
// It does three things and remembers nothing:
//   POST /oauth/token    — exchange an auth code (+ PKCE) for tokens
//   POST /oauth/refresh  — refresh an access token
//   ANY  /hmrc/<path>    — forward a call to HMRC, adding the server-side
//                          fraud-prevention headers HMRC requires
//   GET  /health         — liveness check
//
// The browser sends the HMRC access token in the X-Hmrc-Token header (NOT the
// Authorization header), so it never clashes with Supabase's own gateway auth.
// The relay maps it to "Authorization: Bearer <token>" when forwarding to HMRC.
//
// Deploy with JWT verification OFF so the proxy is publicly callable:
//   supabase functions deploy hmrc-relay --no-verify-jwt
//
// Secrets (set once, never in code):
//   supabase secrets set HMRC_CLIENT_ID=...  HMRC_CLIENT_SECRET=...
// Optional vars (also via `supabase secrets set`):
//   HMRC_ENV=sandbox   APP_VERSION=0.1.0   VENDOR_PUBLIC_IP=0.0.0.0

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Match your ai-proxy allowlist. Add staging if you use it.
const ALLOWED_ORIGINS = [
  "https://ledgerjack.com",
  "https://www.ledgerjack.com",
  "http://localhost:5173",
];

const HMRC_BASES: Record<string, string> = {
  sandbox: "https://test-api.service.hmrc.gov.uk",
  production: "https://api.service.hmrc.gov.uk",
};

function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const allowed = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin);
  return {
    "Access-Control-Allow-Origin": allowed ? requestOrigin! : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Accept, X-Hmrc-Token, Gov-Test-Scenario, " +
      "Gov-Client-Browser-JS-User-Agent, Gov-Client-Device-ID, Gov-Client-Screens, " +
      "Gov-Client-Window-Size, Gov-Client-Timezone, Gov-Client-Browser-Do-Not-Track, " +
      "Gov-Client-User-IDs",
    "Vary": "Origin",
  };
}

function json(data: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function env(key: string, fallback = ""): string {
  return Deno.env.get(key) ?? fallback;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const cors = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return json({ error: "forbidden_origin" }, 403, cors);
  }

  const url = new URL(req.url);
  // Everything after ".../hmrc-relay" is our sub-path
  const path = url.pathname.replace(/^.*\/hmrc-relay/, "") || "/";
  const base = HMRC_BASES[env("HMRC_ENV", "sandbox") === "production" ? "production" : "sandbox"];

  try {
    if (path === "/health" && req.method === "GET") {
      return json({ ok: true, env: env("HMRC_ENV", "sandbox") }, 200, cors);
    }
    if (path === "/oauth/token" && req.method === "POST") {
      return await handleToken(req, base, cors, "authorization_code");
    }
    if (path === "/oauth/refresh" && req.method === "POST") {
      return await handleToken(req, base, cors, "refresh_token");
    }
    if (path.startsWith("/hmrc/")) {
      return await handleProxy(req, base, cors, path, url.search);
    }
    return json({ error: "not_found" }, 404, cors);
  } catch (_err) {
    console.log("relay_error"); // never log bodies or tokens
    return json({ error: "relay_error" }, 502, cors);
  }
});

async function handleToken(
  req: Request,
  base: string,
  cors: Record<string, string>,
  grantType: string,
) {
  const body = await req.json();
  const form = new URLSearchParams();
  form.set("client_id", env("HMRC_CLIENT_ID"));
  form.set("client_secret", env("HMRC_CLIENT_SECRET"));
  form.set("grant_type", grantType);

  if (grantType === "authorization_code") {
    form.set("code", body.code);
    form.set("redirect_uri", body.redirect_uri);
    if (body.code_verifier) form.set("code_verifier", body.code_verifier); // PKCE
  } else {
    form.set("refresh_token", body.refresh_token);
  }

  const resp = await fetch(base + "/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: form.toString(),
  });

  const text = await resp.text();
  return new Response(text, {
    status: resp.status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function handleProxy(
  req: Request,
  base: string,
  cors: Record<string, string>,
  path: string,
  search: string,
) {
  const targetPath = path.replace(/^\/hmrc/, "");
  if (!targetPath.startsWith("/") || targetPath.includes("..")) {
    return json({ error: "bad_path" }, 400, cors);
  }
  const target = base + targetPath + search;

  const headers = new Headers();

  // Map the custom token header to a real HMRC bearer token
  const hmrcToken = req.headers.get("X-Hmrc-Token");
  if (hmrcToken) headers.set("Authorization", `Bearer ${hmrcToken}`);
  headers.set("Accept", req.headers.get("Accept") || "application/vnd.hmrc.1.0+json");
  const ct = req.headers.get("Content-Type");
  if (ct) headers.set("Content-Type", ct);

  // Forward every browser-collected Gov-* header
  for (const [k, v] of req.headers) {
    if (k.toLowerCase().startsWith("gov-")) headers.set(k, v);
  }
  const scenario = req.headers.get("Gov-Test-Scenario");
  if (scenario) headers.set("Gov-Test-Scenario", scenario);

  // --- Server-only fraud-prevention headers ---
  const clientIp = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const nowIso = new Date().toISOString();

  headers.set("Gov-Client-Connection-Method", "WEB_APP_VIA_SERVER");
  if (clientIp) {
    headers.set("Gov-Client-Public-IP", clientIp);
    headers.set("Gov-Client-Public-IP-Timestamp", nowIso);
  }
  headers.set("Gov-Vendor-Product-Name", "LedgerJack");
  headers.set("Gov-Vendor-Version", `ledgerjack=${env("APP_VERSION", "0.1.0")}`);
  // The "by" value needs your real outbound IP. Serverless has no fixed one, so
  // this is a placeholder — VALIDATE with HMRC's Test Fraud Prevention Headers
  // API before switching HMRC_ENV to production. (See START-HERE guide, Phase 4.)
  if (clientIp) {
    headers.set(
      "Gov-Vendor-Forwarded",
      `by=${env("VENDOR_PUBLIC_IP", "0.0.0.0")}&for=${clientIp}`,
    );
  }

  const init: RequestInit = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text();
  }

  const resp = await fetch(target, init);
  const respBody = await resp.text();

  return new Response(respBody, {
    status: resp.status,
    headers: { ...cors, "Content-Type": resp.headers.get("Content-Type") || "application/json" },
  });
}
