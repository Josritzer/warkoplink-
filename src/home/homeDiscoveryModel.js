const ACTIVITY_TOPICS = new Set(['Ngopi Bareng', 'Komunitas & Aktivitas']);

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function getHomeActivityStatus(post, now = new Date()) {
  if (post?.eventStatus === 'cancelled') return 'cancelled';
  const start = toDate(post?.eventStartAt);
  if (!start) return 'unknown';
  const current = toDate(now) || new Date();
  if (current.getTime() < start.getTime()) return 'scheduled';
  const end = toDate(post?.eventEndAt);
  if (!end) return 'unknown';
  if (current.getTime() <= end.getTime()) return 'ongoing';
  return 'completed';
}

export function buildHomeDiscoveryData(warungs = [], posts = [], now = new Date()) {
  const safeWarungs = Array.isArray(warungs) ? warungs : [];
  const safePosts = Array.isArray(posts) ? posts : [];
  const activities = safePosts.filter(post =>
    (ACTIVITY_TOPICS.has(post?.topic) && Boolean(post?.postType || post?.eventStartAt)) ||
    (post?.topic === 'Info & Acara' && getHomeActivityStatus(post, now) === 'ongoing')
  );
  const events = safePosts.filter(post =>
    post?.topic === 'Info & Acara' &&
    post?.eventStatus !== 'cancelled' &&
    getHomeActivityStatus(post, now) === 'scheduled'
  );
  const reels = safePosts.filter(post =>
    typeof post?.videoURL === 'string' && post.videoURL.trim().length > 0
  );
  return {
    warungs: safeWarungs,
    activities: activities.slice(0, 6),
    events: events.slice(0, 4),
    reels: reels.slice(0, 8)
  };
}
