import { describe, expect, it } from 'vitest';
import { shouldRemoveReaction } from './reactions.js';

describe('shouldRemoveReaction', () => {
  it('does not remove a legacy like without emoji', () => {
    expect(shouldRemoveReaction({ uid: 'u' }, '❤️')).toBe(false);
  });
  it('removes an explicitly matching reaction', () => {
    expect(shouldRemoveReaction({ emoji: '❤️' }, '❤️')).toBe(true);
  });
});
