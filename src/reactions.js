export function summarizeReactions(docs, userId = '') {
  const entries = Array.from(docs, (item) => ({
    id: item.id,
    ...(typeof item.data === 'function' ? item.data() : item.data)
  }));
  const ownReaction = userId ? entries.find((entry) => entry.id === userId) : null;
  return {
    count: entries.length,
    liked: Boolean(ownReaction),
    emoji: typeof ownReaction?.emoji === 'string' ? ownReaction.emoji : ''
  };
}

export function shouldRemoveReaction(existingData, emoji) {
  return Boolean(
    existingData
      && Object.prototype.hasOwnProperty.call(existingData, 'emoji')
      && existingData.emoji === emoji
  );
}
