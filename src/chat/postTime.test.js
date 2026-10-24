import { describe, expect, it } from 'vitest';
import { relativePostTime } from './postTime.js';

describe('relativePostTime', () => {
  const now = new Date('2026-10-24T12:00:00.000Z').getTime();
  it('handles missing or invalid timestamps', () => {
    expect(relativePostTime(null, now)).toBe('baru saja');
    expect(relativePostTime({ toDate: () => new Date('invalid') }, now)).toBe('baru saja');
  });
  it('formats recent timestamps into relative Indonesian labels', () => {
    expect(relativePostTime(new Date(now - 30_000), now)).toBe('baru saja');
    expect(relativePostTime(new Date(now - 5 * 60_000), now)).toBe('5m lalu');
    expect(relativePostTime(new Date(now - 2 * 60 * 60_000), now)).toBe('2j lalu');
    expect(relativePostTime(new Date(now - 2 * 24 * 60 * 60_000), now)).toBe('2h lalu');
  });
});
