import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";
import { createClient } from "npm:@supabase/supabase-js@2.55.0";
import { sanitizeImage } from "./image-validation.ts";
import { validateFirebaseAccountLookupResponse } from "../firebase-auth-check/account-lookup.ts";
import {
  encodeFirestoreValue,
  expiredOrphanPaths,
  firestoreDocumentPath,
  mediaObjectPath,
  normalizeUploadRequest,
  parseFirestoreDocument,
  parseMp4Metadata,
  videoDurationForAccount,
  validateImageBytes,
  isMenuUploadAuthorized,
  isMenuPhotoPubliclyPublishable,
  menuPhotoReferenceUpdate,
} from "./policy.ts";

const PROJECT_ID = "sl-community-platform";
const ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
const BUCKET_PENDING = "warkoplink-quarantine";
const BUCKET_PUBLIC = "warkoplink-media";
const BUCKET_VIDEO_PENDING = "warkoplink-video-quarantine";
const BUCKET_VIDEO_PUBLIC = "warkoplink-video";
const THEMATIC_GROUP_IDS = ["pemilik-warkop", "pelaku-umkm", "info-pekerjaan", "event-nobar", "komunitas-olahraga", "kreator-lokal", "jaringan-warga"];
const MAX_BODY_BYTES = 16_384;
const ORIGINS = new Set([
  "https://sl-community-platform.web.app",
  "https://sl-community-platform.firebaseapp.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

type Identity = { uid: string; authTime: number };
type Resource = { data: Record<string, any>; updateTime: string; name: string };
type AuthorizedResource = Resource & { parentWarung?: Resource };

const firebaseApiKey = Deno.env.get("FIREBASE_WEB_API_KEY") ?? "";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const supabaseSecret = secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
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
  // Share the exact tested account-status and revocation rules with firebase-auth-check.
  // Errors are specific but contain no UID, token, email, or account profile data.
  const verifiedAccount = validateFirebaseAccountLookupResponse(
    account,
    payload.sub,
    authTime,
  );
  return { uid: verifiedAccount.uid, authTime: authTime as number };
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

async function isThematicGroupMember(token: string, uid: string): Promise<boolean> {
  const checks = THEMATIC_GROUP_IDS.map(async (groupId) => {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/thematicGroups/${groupId}/members/${uid}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 404) return false;
    if (!response.ok) throw new Error("Thematic group membership check failed");
    return true;
  });
  return (await Promise.all(checks)).some(Boolean);
}

async function isVerifiedWarkopOwner(token: string, uid: string, post: Resource): Promise<boolean> {
  if (typeof post.data.warungId === "string") {
    const linkedWarung = await getResource(token, "warungs", post.data.warungId);
    if (linkedWarung?.data.ownerUid === uid && linkedWarung.data.verificationStatus === "verified") return true;
  }
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "warungs" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "ownerUid" },
              op: "EQUAL",
              value: { stringValue: uid },
            },
          },
          limit: 20,
        },
      }),
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!response.ok) throw new Error("Verified warkop ownership check failed");
  const rows = await response.json();
  return Array.isArray(rows) && rows.some((row) => {
    const data = parseFirestoreDocument(row?.document);
    return data?.ownerUid === uid && data?.verificationStatus === "verified";
  });
}

async function videoDurationLimit(token: string, uid: string, post: Resource): Promise<number> {
  const verifiedWarkopOwner = await isVerifiedWarkopOwner(token, uid, post);
  const thematicGroupMember = verifiedWarkopOwner ? false : await isThematicGroupMember(token, uid);
  return videoDurationForAccount({ verifiedWarkopOwner, thematicGroupMember });
}

async function authorizeResource(token: string, uid: string, request: ReturnType<typeof normalizeUploadRequest>): Promise<AuthorizedResource> {
  if (request.mediaType === "avatar") {
    const profile = await getResource(token, "profiles", uid);
    if (!profile) throw new Error("Profile not found");
    return profile;
  }
  if (request.mediaType === "video") {
    const post = await getResource(token, "posts", request.resourceId!);
    if (!post || post.data.authorId !== uid || post.data.deleting === true) {
      throw new Error("Post ownership check failed");
    }
    const maxDuration = await videoDurationLimit(token, uid, post);
    const maxBytes = maxDuration === 180 ? 50_000_000 : 25_000_000;
    if (request.size > maxBytes) throw new Error(maxDuration === 180 ? "Video size exceeds the 50 MB warkop limit" : "Video size exceeds the 25 MB member limit");
    return post;
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
  if (request.mediaType === "menu") {
    const menu = await getResource(token, "warungMenuItems", request.menuItemId!);
    const warung = await getResource(token, "warungs", request.warungId!);
    if (!menu || !warung || !isMenuUploadAuthorized(menu.data, warung.data, uid, request.warungId!)) {
      throw new Error("Menu item and parent warkop ownership check failed");
    }
    if (!["pending", "verified"].includes(warung.data.verificationStatus)) {
      throw new Error("Menu parent warkop status check failed");
    }
    return { ...menu, parentWarung: warung };
  }
  if (request.mediaType === "event") {
    const post = await getResource(token, "posts", request.resourceId!);
    if (!post || post.data.authorId !== uid || post.data.topic !== "Info & Acara" ||
        typeof post.data.warungId !== "string") {
      throw new Error("Event ownership check failed");
    }
    const warung = await getResource(token, "warungs", post.data.warungId);
    if (!warung || warung.data.ownerUid !== uid || warung.data.verificationStatus !== "verified") {
      throw new Error("Verified warkop ownership required for event posters");
    }
    return post;
  }
  throw new Error("Unsupported media category");
}

async function cleanExpiredPending(uid: string, bucket = BUCKET_PENDING): Promise<void> {
  const { data, error } = await admin.storage.from(bucket).list(`pending/${uid}`, {
    limit: 100,
    sortBy: { column: "created_at", order: "asc" },
  });
  if (error || !data?.length) return;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const expired = data.filter((item) => {
    const created = Date.parse(item.created_at || item.updated_at || "");
    return Number.isFinite(created) && created < cutoff && item.id;
  }).map((item) => `pending/${uid}/${item.name}`);
  if (expired.length) await admin.storage.from(bucket).remove(expired);
}

async function cleanOrphanedPublicMedia(
  token: string,
  uid: string,
  request: ReturnType<typeof normalizeUploadRequest>,
): Promise<void> {
  const resource = await authorizeResource(token, uid, request);
  let folder: string;
  let referencedUrls: string[] = [];
  if (request.mediaType === "avatar") {
    folder = `profiles/${uid}`;
    if (typeof resource.data.photoURL === "string") referencedUrls = [resource.data.photoURL];
  } else if (request.mediaType === "warung") {
    folder = `warungs/${request.resourceId}`;
    referencedUrls = Array.isArray(resource.data.photos) ? resource.data.photos.filter((url: unknown): url is string => typeof url === "string") : [];
  } else if (request.mediaType === "video") {
    folder = `posts/${request.resourceId}`;
    if (typeof resource.data.videoURL === "string") referencedUrls = [resource.data.videoURL];
  } else if (request.mediaType === "menu") {
    folder = `menus/${request.warungId}/${request.menuItemId}`;
    if (typeof resource.data.photoUrl === "string") referencedUrls = [resource.data.photoUrl];
  } else if (request.mediaType === "event") {
    folder = `events/${request.resourceId}`;
    if (typeof resource.data.eventPhotoURL === "string") referencedUrls = [resource.data.eventPhotoURL];
  } else {
    throw new Error("Unsupported media category");
  }
  const cleanupBucket = request.mediaType === "video" ? BUCKET_VIDEO_PUBLIC : BUCKET_PUBLIC;
  const referencedPaths = new Set(referencedUrls.map((value) => {
    if (request.mediaType === "video") {
      try { const parsed = new URL(value); const prefix = `/storage/v1/object/public/${BUCKET_VIDEO_PUBLIC}/`; return parsed.hostname === "klikvxuronunonymmiqv.supabase.co" && parsed.pathname.startsWith(prefix) ? decodeURIComponent(parsed.pathname.slice(prefix.length)) : null; } catch { return null; }
    }
    return isOwnMediaUrl(value);
  }).filter((path): path is string => Boolean(path)));
  const { data, error } = await admin.storage.from(cleanupBucket).list(folder, {
    limit: 100,
    sortBy: { column: "created_at", order: "asc" },
  });
  if (error || !data?.length) return;
  const stalePaths = expiredOrphanPaths(folder, data, referencedPaths);
  if (stalePaths.length) {
    // Best-effort cleanup must never block an authorized upload.
    await admin.storage.from(cleanupBucket).remove(stalePaths).catch(() => ({ error: true }));
  }
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
      fieldPatch = { photoURL: url };
    } else if (request.mediaType === "warung") {
      const photos = Array.isArray(resource.data.photos) ? [...resource.data.photos] : [];
      oldUrl = typeof photos[request.slot!] === "string" ? photos[request.slot!] : null;
      if (request.slot! > photos.length) throw new Error("Warkop photo quota exceeded");
      photos[request.slot!] = url;
      fieldPatch = { photos };
    } else if (request.mediaType === "video") {
      oldUrl = typeof resource.data.videoURL === "string" ? resource.data.videoURL : null;
      fieldPatch = { videoURL: url };
    } else if (request.mediaType === "menu") {
      if (!isMenuPhotoPubliclyPublishable(resource.data, resource.parentWarung?.data, uid, request.warungId!)) {
        throw new Error("Menu publication status check failed");
      }
      const update = menuPhotoReferenceUpdate(resource.data.photoUrl, url);
      oldUrl = update.oldUrl;
      fieldPatch = update.fieldPatch;
    } else if (request.mediaType === "event") {
      oldUrl = typeof resource.data.eventPhotoURL === "string" ? resource.data.eventPhotoURL : null;
      fieldPatch = { eventPhotoURL: url };
    } else {
      throw new Error("Unsupported media category");
    }
    try {
      await patchResource(token, resource, fieldPatch);
      if (request.mediaType === "avatar") {
        const authUpdate = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${encodeURIComponent(firebaseApiKey)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken: token, photoUrl: url, returnSecureToken: false }),
          signal: AbortSignal.timeout(8_000),
        });
        if (!authUpdate.ok) {
          const latest = await getResource(token, "profiles", uid);
          if (latest?.data.photoURL === url) {
            await patchResource(token, latest, { photoURL: oldUrl || "" }).catch(() => {});
          }
          throw new Error("Firebase Auth photo update failed");
        }
        const publicProfile = await getResource(token, "publicProfiles", uid);
        if (publicProfile) {
          await patchResource(token, publicProfile, { photoURL: url }).catch(() => {
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

async function removeAvatar(token: string, uid: string) {
  const profile = await getResource(token, "profiles", uid);
  if (!profile) throw new Error("Profile not found");
  const oldUrl = typeof profile.data.photoURL === "string" ? profile.data.photoURL : "";
  await patchResource(token, profile, { photoURL: "" });
  const authUpdate = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${encodeURIComponent(firebaseApiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: token, deleteAttribute: ["PHOTO_URL"], returnSecureToken: false }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!authUpdate.ok) {
    const latest = await getResource(token, "profiles", uid);
    if (latest?.data.photoURL === "") await patchResource(token, latest, { photoURL: oldUrl }).catch(() => {});
    throw new Error("Firebase Auth photo removal failed");
  }
  const publicProfile = await getResource(token, "publicProfiles", uid);
  if (publicProfile) {
    await patchResource(token, publicProfile, { photoURL: "" }).catch(() => {});
  }
  const oldPath = isOwnMediaUrl(oldUrl);
  if (oldPath) await admin.storage.from(BUCKET_PUBLIC).remove([oldPath]);
  return { removed: true };
}


async function removeVideo(token: string, uid: string, postId: unknown) {
  if (typeof postId !== "string" || !/^[A-Za-z0-9_-]{1,150}$/.test(postId)) throw new Error("Invalid post identifier");
  const post = await getResource(token, "posts", postId);
  if (!post || post.data.authorId !== uid) throw new Error("Post ownership check failed");
  const videoUrl = typeof post.data.videoURL === "string" ? post.data.videoURL : "";
  if (!videoUrl) return { removed: true };
  let path: string;
  try {
    const parsed = new URL(videoUrl);
    const prefix = `/storage/v1/object/public/${BUCKET_VIDEO_PUBLIC}/`;
    if (parsed.hostname !== "klikvxuronunonymmiqv.supabase.co" || !parsed.pathname.startsWith(prefix)) throw new Error("Invalid video reference");
    path = decodeURIComponent(parsed.pathname.slice(prefix.length));
  } catch {
    throw new Error("Invalid video reference");
  }
  if (!path.startsWith(`posts/${postId}/`) || path.includes("..")) throw new Error("Invalid video ownership path");
  const { error } = await admin.storage.from(BUCKET_VIDEO_PUBLIC).remove([path]);
  if (error) throw new Error("Could not remove feed video");
  return { removed: true };
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
  const pendingBucket = request.mediaType === "video" ? BUCKET_VIDEO_PENDING : BUCKET_PENDING;
  await cleanExpiredPending(uid, pendingBucket);
  await cleanOrphanedPublicMedia(token, uid, request);
  const { data: active, error: listError } = await admin.storage.from(pendingBucket).list(`pending/${uid}`, { limit: 100 });
  if (listError) throw new Error("Could not inspect pending uploads");
  if ((active || []).filter((item) => item.id).length >= 3) throw new Error("Too many pending uploads; finish or retry an existing upload");
  const uploadId = typeof body.uploadId === "string" && /^[0-9a-f-]{36}$/i.test(body.uploadId)
    ? body.uploadId
    : crypto.randomUUID();
  const path = `pending/${uid}/${uploadId}`;
  const { data, error } = await admin.storage.from(pendingBucket).createSignedUploadUrl(path, { upsert: false });
  if (error || !data?.token) throw new Error("Could not create signed upload");
  return {
    uploadId,
    path,
    token: data.token,
    signedUrl: data.signedUrl,
    bucket: pendingBucket,
    mediaType: request.mediaType,
    expiresInSeconds: 7200,
  };
}

async function finalizeUpload(token: string, uid: string, body: Record<string, unknown>) {
  const request = normalizeUploadRequest(body);
  const uploadId = typeof body.uploadId === "string" && /^[0-9a-f-]{36}$/i.test(body.uploadId) ? body.uploadId : "";
  if (!uploadId) throw new Error("Invalid upload ID");
  const authorized = await authorizeResource(token, uid, request);
  const video = request.mediaType === "video";
  const menu = request.mediaType === "menu";
  const publishMenu = menu && isMenuPhotoPubliclyPublishable(
    authorized.data, authorized.parentWarung?.data, uid, request.warungId!,
  );
  const quarantineMenu = menu && !publishMenu;
  const publicBucket = video ? BUCKET_VIDEO_PUBLIC : BUCKET_PUBLIC;
  const pendingBucket = video ? BUCKET_VIDEO_PENDING : BUCKET_PENDING;
  const finalPath = mediaObjectPath(uid, request.mediaType, menu ? request.warungId! : (request.resourceId || uid), uploadId, request.slot, request.menuItemId);
  const url = quarantineMenu ? null : admin.storage.from(publicBucket).getPublicUrl(finalPath).data.publicUrl;
  const existingReference = request.mediaType === "avatar" ? authorized.data.photoURL
    : request.mediaType === "warung" ? (authorized.data.photos || [])[request.slot!]
    : request.mediaType === "video" ? authorized.data.videoURL
    : request.mediaType === "menu" ? authorized.data.photoUrl
    : request.mediaType === "event" ? authorized.data.eventPhotoURL
    : null;
  if (url && existingReference === url) {
    return { url, path: finalPath, contentType: video ? "video/mp4" : "image/webp", idempotent: true };
  }
  const pendingPath = `pending/${uid}/${uploadId}`;
  const { data: blob, error: downloadError } = await admin.storage.from(pendingBucket).download(pendingPath);
  if (downloadError || !blob) throw new Error("Uploaded file not found; retry upload");
  const actual = new Uint8Array(await blob.arrayBuffer());
  if (actual.length !== request.size) {
    await admin.storage.from(pendingBucket).remove([pendingPath]);
    throw new Error("Uploaded byte count does not match the declared size");
  }
  let publishBytes: Uint8Array;
  let publishType: string;
  let videoMetadata: { durationSeconds: number; width: number; height: number } | null = null;
  if (video) {
    videoMetadata = parseMp4Metadata(actual);
    if (!videoMetadata) {
      await admin.storage.from(pendingBucket).remove([pendingPath]);
      throw new Error("Invalid MP4 metadata or video dimensions exceed 1080p");
    }
    const maxDuration = await videoDurationLimit(token, uid, authorized);
    if (videoMetadata.durationSeconds > maxDuration) {
      await admin.storage.from(pendingBucket).remove([pendingPath]);
      throw new Error(`Video duration exceeds your ${maxDuration}-second limit`);
    }
    publishBytes = actual;
    publishType = "video/mp4";
  } else {
    const sanitized = await sanitizeImage(actual, request.contentType);
    publishBytes = sanitized.bytes;
    publishType = "image/webp";
  }
  const targetBucket = quarantineMenu ? BUCKET_PENDING : publicBucket;
  const { error: uploadError } = await admin.storage.from(targetBucket).upload(finalPath, publishBytes, {
    contentType: publishType,
    cacheControl: quarantineMenu ? "no-store" : "31536000",
    upsert: true,
  });
  if (uploadError) throw new Error(quarantineMenu ? "Could not retain menu photo in quarantine" : (video ? "Could not publish validated video" : "Could not publish validated image"));
  if (quarantineMenu) {
    await admin.storage.from(pendingBucket).remove([pendingPath]);
    return { path: finalPath, uploadId, quarantined: true, retryWhenPublished: true, contentType: publishType };
  }
  try {
    const previousUrl = await setMediaReference(token, uid, request, url!);
    await admin.storage.from(pendingBucket).remove([pendingPath]);
    const previousPath = video ? null : isOwnMediaUrl(previousUrl);
    if (previousPath && previousPath !== finalPath) await admin.storage.from(BUCKET_PUBLIC).remove([previousPath]);
    return { url, path: finalPath, ...(videoMetadata || {}), contentType: publishType };
  } catch (error) {
    // Compensate only if the Firestore reference was not committed.
    const resource = await authorizeResource(token, uid, request).catch(() => null);
    const current = request.mediaType === "avatar" ? resource?.data.photoURL
      : request.mediaType === "warung" ? resource?.data.photos?.[request.slot!]
      : request.mediaType === "video" ? resource?.data.videoURL
      : request.mediaType === "menu" ? resource?.data.photoUrl
      : request.mediaType === "event" ? resource?.data.eventPhotoURL
      : null;
    if (current !== url) await admin.storage.from(publicBucket).remove([finalPath]);
    throw error;
  }
}

async function publishMenuPhoto(token: string, uid: string, body: Record<string, unknown>) {
  const request = normalizeUploadRequest({ mediaType: "menu", warungId: body.warungId, menuItemId: body.menuItemId, contentType: "image/webp", size: 1 });
  const uploadId = typeof body.uploadId === "string" && /^[0-9a-f-]{36}$/i.test(body.uploadId) ? body.uploadId : "";
  if (!uploadId) throw new Error("Invalid menu photo upload ID");
  const menu = await authorizeResource(token, uid, request);
  if (!isMenuPhotoPubliclyPublishable(menu.data, menu.parentWarung?.data, uid, request.warungId!)) {
    throw new Error("Menu publication status check failed: photo remains quarantined until the menu is public and its parent warkop is verified");
  }
  const path = mediaObjectPath(uid, "menu", request.warungId!, uploadId, undefined, request.menuItemId);
  const { data: blob, error } = await admin.storage.from(BUCKET_PENDING).download(path);
  if (error || !blob) {
    if (typeof menu.data.photoUrl === "string" && isOwnMediaUrl(menu.data.photoUrl) === path) return { url: menu.data.photoUrl, path, contentType: "image/webp", idempotent: true };
    throw new Error("Quarantined menu photo not found");
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!validateImageBytes(bytes, "image/webp")) throw new Error("Invalid quarantined menu photo signature");
  const url = publicUrl(path);
  const { error: publishError } = await admin.storage.from(BUCKET_PUBLIC).upload(path, bytes, { contentType: "image/webp", cacheControl: "31536000", upsert: true });
  if (publishError) throw new Error("Could not publish validated menu photo");
  try {
    const previousUrl = await setMediaReference(token, uid, request, url);
    await admin.storage.from(BUCKET_PENDING).remove([path]);
    const previousPath = isOwnMediaUrl(previousUrl);
    if (previousPath && previousPath !== path) await admin.storage.from(BUCKET_PUBLIC).remove([previousPath]);
    return { url, path, contentType: "image/webp" };
  } catch (error) {
    const latest = await authorizeResource(token, uid, request).catch(() => null);
    if (latest?.data.photoUrl !== url) await admin.storage.from(BUCKET_PUBLIC).remove([path]);
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
  let stage = "read-body";
  let action = "unknown";
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return response({ error: "Request body too large" }, 413, origin);
    stage = "verify-firebase-identity";
    const identity = await verifyIdentity(token);
    stage = "parse-request";
    const body = JSON.parse(rawBody);
    if (!body || typeof body !== "object" || Array.isArray(body)) return response({ error: "Invalid request" }, 400, origin);
    action = typeof body.action === "string" ? body.action : "unknown";
    if (action === "init") {
      stage = "authorize-and-init-upload";
      return response({ upload: await initUpload(token, identity.uid, body) }, 200, origin);
    }
    if (action === "finalize") {
      stage = "validate-and-finalize-upload";
      return response({ media: await finalizeUpload(token, identity.uid, body) }, 200, origin);
    }
    if (action === "publishMenuPhoto") {
      stage = "publish-menu-photo";
      return response({ media: await publishMenuPhoto(token, identity.uid, body) }, 200, origin);
    }
    if (action === "removeAvatar") {
      stage = "remove-avatar";
      return response({ media: await removeAvatar(token, identity.uid) }, 200, origin);
    }
    if (action === "removeVideo") {
      stage = "remove-feed-video";
      return response({ media: await removeVideo(token, identity.uid, body.postId) }, 200, origin);
    }
    return response({ error: "Unsupported action" }, 400, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Media operation failed";
    // Safe diagnostics only: never log Firebase tokens, request bodies, email, or UID.
    console.error("[media-gateway] request failed", JSON.stringify({ stage, action, message }));
    const status = /token|Firebase account|ownership|status check|not found|quota|slot|unsupported|invalid|size|signature|animated|dimensions|too many|not supported|video|duration|1080p/i.test(message) ? 400 : 502;
    return response({ error: message }, status, origin);
  }
}

Deno.serve(handler);
