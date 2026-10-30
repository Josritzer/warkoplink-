import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";
import { lookupFirebaseAccount } from "./firebase-auth-rest.ts";

const FIREBASE_PROJECT_ID = "sl-community-platform";
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const FIREBASE_JWKS_URL = new URL(
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
);
const CLOCK_TOLERANCE_SECONDS = 5;
const allowedOrigins = new Set([
  "https://sl-community-platform.web.app",
  "https://sl-community-platform.firebaseapp.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
const jwks = createRemoteJWKSet(FIREBASE_JWKS_URL);

type FirebaseTimeClaims = {
  exp?: unknown;
  iat?: unknown;
  auth_time?: unknown;
};

type VerifiedFirebaseIdentity = {
  uid: string;
  authTime: number;
};

type VerifyToken = (token: string) => Promise<VerifiedFirebaseIdentity>;
type LookupAccount = (
  idToken: string,
  verifiedUid: string,
  authTimeSeconds: unknown,
  apiKey: string,
) => Promise<{ uid: string }>;

type HandlerDependencies = {
  apiKey: string;
  verifyToken?: VerifyToken;
  lookupAccount?: LookupAccount;
};

export function validateFirebaseTimeClaims(
  claims: FirebaseTimeClaims,
  nowSeconds: number,
): boolean {
  const { exp, iat, auth_time: authTime } = claims;
  if (![exp, iat, authTime].every((value) =>
    typeof value === "number" && Number.isSafeInteger(value)
  )) return false;

  const expiration = exp as number;
  const issuedAt = iat as number;
  const authenticatedAt = authTime as number;

  return expiration > nowSeconds - CLOCK_TOLERANCE_SECONDS &&
    issuedAt <= nowSeconds + CLOCK_TOLERANCE_SECONDS &&
    authenticatedAt <= nowSeconds + CLOCK_TOLERANCE_SECONDS &&
    expiration > issuedAt &&
    authenticatedAt <= issuedAt + CLOCK_TOLERANCE_SECONDS;
}

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

export async function verifyFirebaseIdToken(
  token: string,
): Promise<VerifiedFirebaseIdentity> {
  const { payload, protectedHeader } = await jwtVerify(token, jwks, {
    algorithms: ["RS256"],
    audience: FIREBASE_PROJECT_ID,
    issuer: FIREBASE_ISSUER,
    clockTolerance: CLOCK_TOLERANCE_SECONDS,
  });

  if (protectedHeader.alg !== "RS256" ||
    typeof payload.sub !== "string" ||
    payload.sub.length === 0 ||
    payload.sub.length > 128 ||
    !validateFirebaseTimeClaims(payload, Math.floor(Date.now() / 1000))) {
    throw new Error("Invalid Firebase ID token claims");
  }

  return { uid: payload.sub, authTime: payload.auth_time as number };
}

/**
 * Creates the read-only identity-check handler.
 * A request is accepted only after both JWT verification and a live Firebase
 * account lookup confirm the account is enabled and the token is not revoked.
 */
export function createHandler(dependencies: HandlerDependencies) {
  const verifyToken = dependencies.verifyToken ?? verifyFirebaseIdToken;
  const lookupAccount = dependencies.lookupAccount ?? lookupFirebaseAccount;

  return async function firebaseAuthHandler(req: Request): Promise<Response> {
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
      const identity = await verifyToken(token);
      const account = await lookupAccount(
        token,
        identity.uid,
        identity.authTime,
        dependencies.apiKey,
      );
      return jsonResponse({ authenticated: true, uid: account.uid }, 200, origin);
    } catch {
      // Never return verifier details, raw tokens, or claims to the caller.
      return jsonResponse({ error: "Invalid or expired Firebase ID token" }, 401, origin);
    }
  };
}

export function handler(req: Request): Promise<Response> {
  return createHandler({
    apiKey: Deno.env.get("FIREBASE_WEB_API_KEY") ?? "",
  })(req);
}

if (import.meta.main) {
  Deno.serve(handler);
}
