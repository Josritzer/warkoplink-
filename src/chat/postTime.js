export function relativePostTime(value, now = Date.now()) {
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : null;
  if (!date || Number.isNaN(date.getTime())) return 'baru saja';
  const seconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));
  if (seconds < 60) return 'baru saja';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm lalu';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'j lalu';
  if (seconds < 604800) return Math.floor(seconds / 86400) + 'h lalu';
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}
