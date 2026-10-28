const REACTION_FIELDS = {
  '👍': 'like',
  '👏': 'like',
  '🙌': 'like',
  '💪': 'like',
  '🤝': 'like',
  '💯': 'like',
  '❤️': 'love',
  '🥰': 'love',
  '😍': 'love',
  '😘': 'love',
  '💖': 'love',
  '💕': 'love',
  '😂': 'haha',
  '🤣': 'haha',
  '😆': 'haha',
  '😹': 'haha',
  '😅': 'haha',
  '🤪': 'haha',
  '😮': 'wow',
  '😲': 'wow',
  '🤯': 'wow',
  '🤩': 'wow',
  '🥳': 'wow',
  '✨': 'wow',
  '😢': 'sad',
  '😭': 'sad',
  '🥺': 'sad',
  '😔': 'sad',
  '💔': 'sad',
  '🫂': 'sad',
  '😡': 'angry',
  '🤬': 'angry',
  '😤': 'angry',
  '🙄': 'angry',
  '😠': 'angry',
  '👎': 'angry'
};

export const EMPTY_REACTIONS = Object.freeze({
  like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0
});

export function reactionFieldForEmoji(emoji) {
  return REACTION_FIELDS[emoji] || '';
}

export function summarizeReactions(docs, userId = '') {
  const entries = Array.from(docs, (item) => ({
    id: item.id,
    ...(typeof item.data === 'function' ? item.data() : item.data)
  }));
  const ownReaction = userId ? entries.find((entry) => entry.id === userId) : null;
  const reactions = { ...EMPTY_REACTIONS };
  entries.forEach((entry) => {
    // Legacy likes had no emoji field; preserve them in the 👍 bucket.
    // Legacy likes without an emoji stay in the like aggregate; unknown explicit emoji values are ignored.
    const field = typeof entry.emoji !== 'string' || !entry.emoji
      ? 'like'
      : reactionFieldForEmoji(entry.emoji);
    if (field) reactions[field] += 1;
  });
  return {
    count: entries.length,
    totalReactions: entries.length,
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
