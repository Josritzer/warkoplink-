export function isGroupUnread(lastReadAt, latestMessageAt) {
  const toMillis = (value) => {
    if (value?.toMillis) return value.toMillis();
    if (value instanceof Date) return value.getTime();
    return Number.NaN;
  };
  const lastRead = toMillis(lastReadAt);
  const latestMessage = toMillis(latestMessageAt);
  return Number.isFinite(lastRead) && Number.isFinite(latestMessage) && latestMessage > lastRead;
}
