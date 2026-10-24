import { describe, expect, it } from 'vitest';
import { shouldRemoveReaction, summarizeReactions } from './reactions.js';

const doc = (id, data) => ({ id, data: () => data });

describe('summarizeReactions', () => {
  it('restores the user emoji and total count from Firestore documents', () => {
    expect(summarizeReactions([
      doc('u1', { uid: 'u1', emoji: '😂' }),
      doc('u2', { uid: 'u2', emoji: '❤️' })
    ], 'u1')).toEqual({ count: 2, totalReactions: 2, reactions: { like: 0, love: 1, haha: 1, wow: 0, sad: 0, angry: 0 }, liked: true, emoji: '😂' });
  });

  it('counts a legacy like without selecting an emoji', () => {
    expect(summarizeReactions([doc('u1', { uid: 'u1', createdAt: 1 })], 'u1'))
      .toEqual({ count: 1, totalReactions: 1, reactions: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 }, liked: true, emoji: '' });
  });

  it('does not select another user reaction', () => {
    expect(summarizeReactions([doc('u1', { emoji: '👍' })], 'u2'))
      .toEqual({ count: 1, totalReactions: 1, reactions: { like: 1, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 }, liked: false, emoji: '' });
  });
});

describe('shouldRemoveReaction', () => {
  it('removes only an explicitly matching emoji', () => {
    expect(shouldRemoveReaction({ emoji: '❤️' }, '❤️')).toBe(true);
    expect(shouldRemoveReaction({ emoji: '❤️' }, '😂')).toBe(false);
  });

  it('does not delete a legacy like without emoji', () => {
    expect(shouldRemoveReaction({ uid: 'u1', createdAt: 1 }, '❤️')).toBe(false);
  });
});
