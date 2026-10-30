import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";
import { createClient } from "npm:@supabase/supabase-js@2.55.0";
import { sanitizeImage } from "./image-validation.ts";
import {
  encodeFirestoreValue,
  firestoreDocumentPath,
  mediaObjectPath,
  normalizeUploadRequest,
  parseFirestoreDocument,
} from "./policy.ts";

const PROJECT_ID = "sl-community-platform";
const ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
const BUCKET_PENDING = "warkoplink-quarantine";
const BUCKET_PUBLIC = "warkoplink-media";
const MAX_BODY_BYTES = 16_384;
const ORIGINS = new Set([
  "https://sl-community-platform.web.app",
  "https://sl-community-platform.firebaseapp.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

type Identity = { uid: string; authTime: number };
type Resource = { data: Record<string, any>; updateTime: string; name: string };

const firebaseApiKey = Deno.env.get("FIREBASE_WEB_API_KEY") ?? "";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(supabaseUrl, supabaseSecret, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function response(body: Record<string, unknown>, status: number, origin: string | null): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  });
  if (origin && ORIGINS.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return new Response(JSON.stringify(body), { status, headers });
}

function bearer(request: Request): string | null {
  const match = /^Bearer\s+([^\s]+)$/i.exec(request.headers.get("Authorization")?.trim() || "");
  return match?.[1] ?? null;
}

async function verifyIdentity(token: string): Promise<Identity> {
  if (!firebaseApiKey) throw new Error("Firebase gateway is not configured");
  const { payload, protectedHeader } = await jwtVerify(token, JWKS, {
    algorithms: ["RS256"],
    audience: PROJECT_ID,
    issuer: ISSUER,
    clockTolerance: 5,
  });
  const now = Math.floor(Date.now() / 1000);
  const exp = payload.exp;
  const iat = payload.iat;
  const authTime = payload.auth_time;
  if (protectedHeader.alg !== "RS256" || typeof payload.sub !== "string" ||
      payload.sub.length < 1 || payload.sub.length > 128 ||
      ![exp, iat, authTime].every((n) => typeof n === "number" && Number.isSafeInteger(n)) ||
      (exp as number) <= now - 5 || (iat as number) > now + 5 ||
      (authTime as number) > now + 5 || (exp as number) <= (iat as number) ||
      (authTime as number) > (iat as number) + 5) {
    throw new Error("Invalid Firebase token");
  }
  const lookup = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: token }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!lookup.ok) throw new Error("Firebase account lookup failed");
  const account = await lookup.json();
  const users = account?.users;
  if (!Array.isArray(users) || users.length !== 1 ||
      users[0]?.localId !== payload.sub || users[0]?.disabled !== false ||
      typeof users[0]?.validSince !== "string" ||
      !Number.isFinite(Number(users[0].validSince)) ||
      (authTime as number) < Number(users[0].validSince)) {
    throw new Error("Firebase account is disabled or token revoked");
  }
  return { uid: payload.sub, authTime: authTime as number };
}

function firestoreUrl(collection: string, id: string): string {
  const path = firestoreDocumentPath(collection, id);
  return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
}

async function getResource(token: string, collection: string, id: string): Promise<Resource | null> {
  const result = await fetch(firestoreUrl(collection, id), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (result.status === 404) return null;
  if (!result.ok) throw new Error("Firestore authorization lookup failed");
  const document = await result.json();
  const data = parseFirestoreDocument(document);
  if (!data || typeof document.updateTime !== "string") return null;
  return { data, updateTime: document.updateTime, name: document.name };
}

async function patchResource(
  token: string,
  resource: Resource,
  fields: Record<string, unknown>,
): Promise<Resource> {
  const url = new URL(`https://firestore.googleapis.com/v1/${resource.name}`);
  for (const key of Object.keys(fields)) url.searchParams.append("updateMask.fieldPaths", key);
  url.searchParams.set("currentDocument.updateTime", resource.updateTime);
  const encoded = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encodeFirestoreValue(value)]));
  const result = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: encoded }),
    signal: AbortSignal.timeout(8_000),
  });
  if (result.status === 409 || result.status === 412) throw new Error("RESOURCE_CHANGED_RETRY");
  if (!result.ok) throw new Error("Firestore update rejected");
  const document = await result.json();
  const data = parseFirestoreDocument(document);
  if (!data || typeof document.updateTime !== "string") throw new Error("Firestore update response invalid");
  return { data, updateTime: document.updateTime, name: document.name };
}

async function authorizeResource(token: string, uid: string, request: ReturnType<typeof normalizeUploadRequest>): Promise<Resource> {
  if (request.mediaType === "avatar") {
    const profile = await getResource(token, "profiles", uid);
    if (!profile) throw new Error("Profile not found");
    return profile;
  }
  if (request.mediaType === "warung") {
    const warung = await getResource(token, "warungs", request.resourceId!);
    if (!warung || warung.data.ownerUid !== uid ||
        !["pending", "verified"].includes(warung.data.verificationStatus)) {
      throw new Error("Warkop ownership or status check failed");
    }
    const photos = Array.isArray(warung.data.photos) ? warung.data.photos : [];
    if (photos.length > 5 || request.slot! > photos.length) {
      throw new Error("Warkop photo quota exceeded or slot is not sequential");
    }
    return warung;
  }
  const post = await getResource(token, "posts", request.resourceId!);
  if (!post || post.data.authorId !== uid || post.data.postType !== "Acara Warkop" ||
      typeof post.data.warungId !== "string") {
    throw new Error("Event ownership check failed");
  }
  const warung = await getResource(token, "warungs", post.data.warungId);
  if (!warung || warung.data.ownerUid !== uid || warung.data.verificationStatus !== "verified") {
    throw new Error("Verified warkop ownership required for event posters");
  }
  return post;
}

async function cleanExpiredPending(uid: string): Promise<void> {
  const { data, error } = await admin.storage.from(BUCKET_PENDING).list(`pending/${uid}`, {
    limit: 100,
    sortBy: { column: "created_at", order: "asc" },
  });
  if (error || !data?.length) return;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const expired = data.filter((item) => {
    const created = Date.parse(item.created_at || item.updated_at || "");
    return Number.isFinite(created) && created < cutoff && item.id;
  }).map((item) => `pending/${uid}/${item.name}`);
  if (expired.length) await admin.storage.from(BUCKET_PENDING).remove(expired);
}

function publicUrl(path: string): string {
  return admin.storage.from(BUCKET_PUBLIC).getPublicUrl(path).data.publicUrl;
}

async function setMediaReference(
  token: string,
  uid: string,
  request: ReturnType<typeof normalizeUploadRequest>,
  url: string,
): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const resource = await authorizeResource(token, uid, request);
    let fieldPatch: Record<string, unknown>;
    let oldUrl: string | null = null;
    if (request.mediaType === "avatar") {
      oldUrl = typeof resource.data.photoURL === "string" ? resource.data.photoURL : null;
      const authUpdate = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${encodeURIComponent(firebaseApiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token, photoUrl: url, returnSecureToken: false }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!authUpdate.ok) throw new Error("Firebase Auth photo update failed");
      fieldPatch = { photoURL: url };
    } else if (request.mediaType === "warung") {
      const photos = Array.isArray(resource.data.photos) ? [...resource.data.photos] : [];
      oldUrl = typeof photos[request.slot!] === "string" ? photos[request.slot!] : null;
      if (request.slot! > photos.length) throw new Error("Warkop photo quota exceeded");
      photos[request.slot!] = url;
      fieldPatch = { photos };
    } else {
      oldUrl = typeof resource.data.eventPosterURL === "string" ? resource.data.eventPosterURL : null;
      fieldPatch = { eventPosterURL: url };
    }
    try {
      await patchResource(token, resource, fieldPatch);
      if (request.mediaType === "avatar") {
        const publicProfile = await getResource(token, "publicProfiles", uid);
        if (publicProfile) {
          await patchResource(token, publicProfile, { photoURL: url, updatedAt: new Date() }).catch(() => {
            // The private profile and Firebase Auth are authoritative; public projection can be repaired on next sign-in.
          });
        }
      }
      return oldUrl;
    } catch (error) {
      if (error instanceof Error && error.message === "RESOURCE_CHANGED_RETRY" && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("Resource changed repeatedly; retry upload");
}

function isOwnMediaUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const prefix = `/storage/v1/object/public/${BUCKET_PUBLIC}/`;
    if (parsed.hostname !== "klikvxuronunonymmiqv.supabase.co" || !parsed.pathname.startsWith(prefix)) return null;
    return decodeURIComponent(parsed.pathname.slice(prefix.length));
  } catch {
    return null;
  }
}

async function initUpload(token: string, uid: string, body: Record<string, unknown>) {
  const request = normalizeUploadRequest(body);
  await authorizeResource(token, uid, request);
  await cleanExpiredPending(uid);
  const { data: active, error: listError } = await admin.storage.from(BUCKET_PENDING).list(`pending/${uid}`, { limit: 100 });
  if (listError) throw new Error("Could not inspect pending uploads");
  if ((active || []).filter((item) => item.id).length >= 3) throw new Error("Too many pending uploads; finish or retry an existing upload");
  const uploadId = typeof body.uploadId === "string" && /^[0-9a-f-]{36}$/i.test(body.uploadId)
    ? body.uploadId
    : crypto.randomUUID();
  const path = `pending/${uid}/${uploadId}`;
  const { data, error } = await admin.storage.from(BUCKET_PENDING).createSignedUploadUrl(path, { upsert: false });
  if (error || !data?.token) throw new Error("Could not create signed upload");
  return {
    uploadId,
    path,
    token: data.token,
    bucket: BUCKET_PENDING,
    mediaType: request.mediaType,
    expiresInSeconds: 7200,
  };
}

async function finalizeUpload(token: string, uid: string, body: Record<string, unknown>) {
  const request = normalizeUploadRequest(body);
  const uploadId = typeof body.uploadId === "string" && /^[0-9a-f-]{36}$/i.test(body.uploadId) ? body.uploadId : "";
  if (!uploadId) throw new Error("Invalid upload ID");
  await authorizeResource(token, uid, request);
  const pendingPath = `pending/${uid}/${uploadId}`;
  const { data: blob, error: downloadError } = await admin.storage.from(BUCKET_PENDING).download(pendingPath);
  if (downloadError || !blob) throw new Error("Uploaded file not found; retry upload");
  const actual = new Uint8Array(await blob.arrayBuffer());
  if (actual.length !== request.size) {
    await admin.storage.from(BUCKET_PENDING).remove([pendingPath]);
    throw new Error("Uploaded byte count does not match the declared size");
  }
  const sanitized = await sanitizeImage(actual, request.contentType);
  const finalPath = mediaObjectPath(uid, request.mediaType, request.resourceId || uid, uploadId, request.slot);
  const { error: uploadError } = await admin.storage.from(BUCKET_PUBLIC).upload(finalPath, sanitized.bytes, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: true,
  });
  if (uploadError) throw new Error("Could not publish validated image");
  const url = publicUrl(finalPath);
  try {
    const previousUrl = await setMediaReference(token, uid, request, url);
    await admin.storage.from(BUCKET_PENDING).remove([pendingPath]);
    const previousPath = isOwnMediaUrl(previousUrl);
    if (previousPath && previousPath !== finalPath) await admin.storage.from(BUCKET_PUBLIC).remove([previousPath]);
    return { url, path: finalPath, width: sanitized.width, height: sanitized.height, contentType: sanitized.contentType };
  } catch (error) {
    // Compensate only if the Firestore reference was not committed.
    const resource = await authorizeResource(token, uid, request).catch(() => null);
    const current = request.mediaType === "avatar" ? resource?.data.photoURL
      : request.mediaType === "warung" ? resource?.data.photos?.[request.slot!]
      : resource?.data.eventPosterURL;
    if (current !== url) await admin.storage.from(BUCKET_PUBLIC).remove([finalPath]);
    throw error;
  }
}

async function handler(request: Request): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (origin && !ORIGINS.has(origin)) return response({ error: "Origin not allowed" }, 403, null);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
    "Access-Control-Allow-Origin": origin || "",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  } });
  if (request.method !== "POST") return response({ error: "Method not allowed" }, 405, origin);
  const token = bearer(request);
  if (!token) return response({ error: "Missing Firebase bearer token" }, 401, origin);
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_BODY_BYTES) return response({ error: "Request body too large" }, 413, origin);
  try {
    const identity = await verifyIdentity(token);
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return response({ error: "Invalid request" }, 400, origin);
    const action = body.action;
    if (action === "init") return response({ upload: await initUpload(token, identity.uid, body) }, 200, origin);
    if (action === "finalize") return response({ media: await finalizeUpload(token, identity.uid, body) }, 200, origin);
    return response({ error: "Unsupported action" }, 400, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Media operation failed";
    const status = /token|Firebase account|ownership|status check|not found|quota|slot|unsupported|invalid|size|signature|animated|dimensions|too many|not supported/i.test(message) ? 400 : 502;
    return response({ error: message }, status, origin);
  }
}

Deno.serve(handler);
