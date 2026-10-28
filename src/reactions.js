const REACTION_FIELDS = {
  '👍': 'like',
  '❤️': 'love',
  '😂': 'haha',
  '😮': 'wow',
  '😢': 'sad',
  '😡': 'angry'
};

export const EMPTY_REACTIONS = Object.freeze({
  like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0
});

export function reactionFieldForEmoji(emoji) {
  return typeof emoji === 'string' && Object.prototype.hasOwnProperty.call(REACTION_FIELDS, emoji)
    ? REACTION_FIELDS[emoji]
    : '';
}

export function summarizeReactions(docs, userId = '') {
  const entries = Array.from(docs, (item) => ({
    id: item.id,
    ...(typeof item.data === 'function' ? item.data() : item.data)
  }));

  // Preserve legacy likes without an emoji field, but don't reinterpret unknown
  // or malformed emoji data as 👍. Firestore Rules remain the authoritative guard.
  const validEntries = entries.filter((entry) => (
    !Object.prototype.hasOwnProperty.call(entry, 'emoji')
    || Boolean(reactionFieldForEmoji(entry.emoji))
  ));
  const ownReaction = userId ? validEntries.find((entry) => entry.id === userId) : null;
  const reactions = { ...EMPTY_REACTIONS };

  validEntries.forEach((entry) => {
    const hasEmoji = Object.prototype.hasOwnProperty.call(entry, 'emoji');
    const field = hasEmoji ? reactionFieldForEmoji(entry.emoji) : 'like';
    if (field) reactions[field] += 1;
  });

  return {
    count: validEntries.length,
    totalReactions: validEntries.length,
    reactions,
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
