import { describe, expect, it } from 'vitest';
import { normalizeUsername, validateProfileDraft } from './profileModel.js';

describe('normalizeUsername', () => {
  it('trims, removes one leading at-sign, and lowercases usernames', () => {
    expect(normalizeUsername('  @Kopi_Senja  ')).toBe('kopi_senja');
  });
});

describe('validateProfileDraft', () => {
  const valid = { displayName: 'Admin Warkop', username: '@admin_warkop', bio: 'Pecinta kopi', location: 'Maduran', interests: ['Ngopi', 'Nobar'] };

  it('accepts a valid profile and normalizes its username', () => {
    expect(validateProfileDraft(valid)).toMatchObject({ ok: true, value: { username: 'admin_warkop', displayName: 'Admin Warkop' } });
  });

  it('rejects usernames outside the 3–20 lowercase-safe character rule', () => {
    for (const username of ['ab', 'with space', 'UPPERCASE', 'name.with.dot', 'a'.repeat(21)]) {
      expect(validateProfileDraft({ ...valid, username }).ok).toBe(false);
    }
  });

  it('rejects display names and bios beyond their limits', () => {
    expect(validateProfileDraft({ ...valid, displayName: 'A' }).ok).toBe(false);
    expect(validateProfileDraft({ ...valid, bio: 'x'.repeat(161) }).ok).toBe(false);
  });

  it('limits interests and rejects insecure social links', () => {
    expect(validateProfileDraft({ ...valid, interests: Array(9).fill('Ngopi') }).ok).toBe(false);
    expect(validateProfileDraft({ ...valid, socialLinks: { instagram: 'javascript:alert(1)' } }).ok).toBe(false);
    expect(validateProfileDraft({ ...valid, socialLinks: { instagram: 'https://instagram.com/example' } }).ok).toBe(true);
  });
});
