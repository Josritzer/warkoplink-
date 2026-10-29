import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";

const FIREBASE_PROJECT_ID = "sl-community-platform";
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const FIREBASE_JWKS_URL = new URL(
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
);
const allowedOrigins = new Set([
  "https://sl-community-platform.web.app",
  "https://sl-community-platform.firebaseapp.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
const jwks = createRemoteJWKSet(FIREBASE_JWKS_URL);

export function extractBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

export function isAllowedOrigin(origin: string | null): boolean {
  // Non-browser clients may omit Origin; browsers must match the allowlist.
  return origin === null || allowedOrigins.has(origin);
}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export async function verifyFirebaseIdToken(token: string): Promise<{ uid: string }> {
  const { payload, protectedHeader } = await jwtVerify(token, jwks, {
    algorithms: ["RS256"],
    audience: FIREBASE_PROJECT_ID,
    issuer: FIREBASE_ISSUER,
    clockTolerance: 5,
  });

  if (protectedHeader.alg !== "RS256" || typeof payload.sub !== "string" ||
    payload.sub.length === 0 || payload.sub.length > 128) {
    throw new Error("Invalid Firebase subject");
  }

  return { uid: payload.sub };
}

export async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get("Origin");

  if (!isAllowedOrigin(origin)) {
    return jsonResponse({ error: "Origin not allowed" }, 403, null);
  }

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  const token = extractBearerToken(req.headers.get("Authorization"));
  if (!token) {
    return jsonResponse({ error: "Missing Firebase bearer token" }, 401, origin);
  }

  try {
    const identity = await verifyFirebaseIdToken(token);
    return jsonResponse({ authenticated: true, uid: identity.uid }, 200, origin);
  } catch {
    // Never return verifier details, raw tokens, or claims to the caller.
    return jsonResponse({ error: "Invalid or expired Firebase ID token" }, 401, origin);
  }
}

if (import.meta.main) {
  Deno.serve(handler);
}
