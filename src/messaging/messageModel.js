export function conversationIdFor(uidA, uidB) {
  if (!uidA || !uidB || uidA === uidB) return '';
  return [uidA, uidB].sort().join('__');
}
export function isMutualFollow(uidA, uidB, followIds) {
  if (!uidA || !uidB || uidA === uidB) return false;
  const ids = followIds instanceof Set ? followIds : new Set(followIds || []);
  return ids.has(`${uidA}_${uidB}`) && ids.has(`${uidB}_${uidA}`);
}
export function friendNotificationId(uidA, uidB, recipientUid) {
  return `friend_${[uidA, uidB].sort().join('_')}_${recipientUid}`;
}
export function messagePreview(value, maxLength = 96) {
  const body = String(value || '').trim();
  return body.length > maxLength ? `${body.slice(0, maxLength - 1)}…` : body;
}
