// FIX #7 — Replace wildcard CORS with an allowlist of production origins.
//
// Previously: "Access-Control-Allow-Origin": "*"
// A wildcard allows any website to POST to this endpoint using a stolen credit token.
// Since the credit token lives in localStorage (accessible to XSS), combining wildcard
// CORS with any XSS on the app domain gave attackers cross-origin drain of credits.
//
// Now: only requests from the listed origins are accepted.
// Add your staging domain to ALLOWED_ORIGINS if needed.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// FIX #7 — update this list to match your actual production domain(s)
const ALLOWED_ORIGINS = [
  "https://ledgerjack.com",
  "https://www.ledgerjack.com",
  // Add staging: "https://staging.ledgerjack.com",
];

function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const origin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
    ? requestOrigin   // echo back the matched origin
    : ALLOWED_ORIGINS[0]; // fall back to primary — browser will block mismatches anyway

  return {
    "Access-Control-Allow-Origin":  origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Vary": "Origin", // required when the header value is dynamic
  };
}

function json(data: unknown, status = 200, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req: Request) => {
  const requestOrigin = req.headers.get("Origin");
  const corsHeaders   = getCorsHeaders(requestOrigin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, corsHeaders);
  }

  let receiptText: string | undefined;
  let creditToken: string | undefined;

  try {
    const body  = await req.json();
    receiptText = body.receiptText;
    creditToken = body.creditToken;
  } catch {
    return json({ error: "Invalid request body." }, 400, corsHeaders);
  }

  if (!receiptText || !creditToken) {
    return json({ error: "Missing receiptText or creditToken." }, 400, corsHeaders);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openaiKey   = Deno.env.get("OPENAI_API_KEY");

  if (!supabaseUrl || !serviceKey || !openaiKey) {
    return json({ error: "Server misconfiguration." }, 500, corsHeaders);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Atomically decrement — throws if balance is 0 or token doesn't exist
  const { data: newBalance, error: creditError } = await supabase
    .rpc("decrement_ai_credit", { p_token: creditToken });

  if (creditError) {
    if (creditError.message?.includes("insufficient_credits")) {
      return json(
        { error: "Insufficient AI credits. Please reload your balance in Settings." },
        402,
        corsHeaders,
      );
    }
    return json({ error: "Credit check failed." }, 500, corsHeaders);
  }

  const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Convert receipt text into structured ledger splits. Return a JSON object with a 'splits' array. Each split must have: account (string), amount (integer cents, positive), is_debit (boolean). Debits and credits must balance to zero sum.",
        },
        { role: "user", content: receiptText },
      ],
      response_format: { type: "json_object" },
      max_tokens: 500,
      temperature: 0,
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    console.error("[ai-proxy] OpenAI error:", errText);
    return json({ error: "AI processing failed." }, 502, corsHeaders);
  }

  const aiData  = await aiRes.json();
  const content = aiData.choices?.[0]?.message?.content || "{}";

  let parsed: { splits?: unknown[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    return json({ error: "AI returned unparseable response." }, 502, corsHeaders);
  }

  return json(
    { splits: parsed.splits ?? [], creditsRemaining: newBalance as number },
    200,
    corsHeaders,
  );
});
