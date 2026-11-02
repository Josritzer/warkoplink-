export function extractMentionUsernames(value) {
  const text = String(value ?? '');
  const matches = text.matchAll(/(^|[^a-z0-9_])@([a-z0-9_]{3,20})(?![a-z0-9_-])/gi);
  return [...new Set([...matches].map(match => match[2].toLowerCase()))];
}

export function notificationLabel(notification = {}) {
  if (notification.type === 'mention') return 'menyebut Anda dalam obrolan';
  if (notification.type === 'comment') return 'mengomentari obrolan Anda';
  if (notification.type === 'reaction') return 'memberi reaksi pada obrolan Anda';
  if (notification.type === 'follow') return 'mulai mengikuti warkop Anda';
  if (notification.type === 'friend') return 'sekarang menjadi teman Anda karena kalian saling mengikuti';
  if (notification.type === 'message') return 'mengirim pesan pribadi kepada Anda';
  return 'mengirim notifikasi';
}

export function isUnreadNotification(notification = {}) {
  return notification.readAt == null;
}
