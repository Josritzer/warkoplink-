import { describe, expect, it } from 'vitest';
import { isGroupUnread } from './groupUnread.js';

describe('thematic group unread state', () => {
  const stamp = (value) => ({ toMillis: () => value });

  it('marks a group unread when its latest message is newer than last read', () => {
    expect(isGroupUnread(stamp(200), stamp(201))).toBe(true);
  });

  it('does not mark a group unread when already read at or after the latest message', () => {
    expect(isGroupUnread(stamp(200), stamp(200))).toBe(false);
    expect(isGroupUnread(stamp(201), stamp(200))).toBe(false);
  });

  it('does not mark missing or invalid timestamps as unread', () => {
    expect(isGroupUnread(null, stamp(201))).toBe(false);
    expect(isGroupUnread(stamp(200), null)).toBe(false);
  });
});
