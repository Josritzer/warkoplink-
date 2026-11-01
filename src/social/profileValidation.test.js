import { describe, expect, it } from 'vitest';
import { normalizeUsername, validateProfileDraft } from './profileValidation.js';

describe('profileValidation', () => {
  it('normalizes a username before it is claimed', () => {
    expect(normalizeUsername('  @@Budi_Kopi  ')).toBe('budi_kopi');
  });

  it('accepts a valid profile draft and trims public text', () => {
    expect(validateProfileDraft({
      displayName: '  Budi  ', username: '@Budi_01', bio: '  Suka ngopi  ', location: '  Maduran  '
    })).toEqual({
      ok: true,
      value: { displayName: 'Budi', username: 'budi_01', bio: 'Suka ngopi', location: 'Maduran' }
    });
  });

  it('allows legacy users to save profile details before choosing a username', () => {
    expect(validateProfileDraft({ displayName: 'Budi', username: '', bio: '', location: '' }).ok).toBe(true);
  });

  it('rejects malformed and reserved usernames', () => {
    for (const username of ['ab', 'two words', 'admin', 'bad-name', 'a'.repeat(21)]) {
      expect(validateProfileDraft({ displayName: 'Budi', username }).ok).toBe(false);
    }
  });

  it('enforces bio and location limits', () => {
    expect(validateProfileDraft({ displayName: 'Budi', bio: 'x'.repeat(161) }).ok).toBe(false);
    expect(validateProfileDraft({ displayName: 'Budi', location: 'x'.repeat(81) }).ok).toBe(false);
  });
});
