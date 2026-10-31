import { describe, expect, it } from 'vitest';
import { withPublicAuthorProfile } from './authorProfile.js';

describe('withPublicAuthorProfile', () => {
  it('uses the latest public avatar for an older post or comment', () => {
    const record = { authorId: 'user-1', authorName: 'Nama Lama', authorPhotoURL: null };
    const profile = { displayName: 'Nama Baru', photoURL: 'https://cdn.example/avatar.webp' };
    expect(withPublicAuthorProfile(record, profile)).toEqual({
      authorId: 'user-1',
      authorName: 'Nama Baru',
      authorPhotoURL: 'https://cdn.example/avatar.webp'
    });
  });

  it('keeps the historical avatar when no public avatar is available', () => {
    const record = { authorName: 'Anggota', authorPhotoURL: 'https://cdn.example/old.webp' };
    expect(withPublicAuthorProfile(record, { photoURL: '' }).authorPhotoURL).toBe('https://cdn.example/old.webp');
  });

  it('keeps a safe fallback when the public profile is missing', () => {
    expect(withPublicAuthorProfile({ authorName: 'Anggota' }, null)).toMatchObject({
      authorName: 'Anggota',
      authorPhotoURL: null
    });
  });
});
