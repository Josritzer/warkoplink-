import { describe, expect, it } from 'vitest';
import { publicAvatarProfile } from './publicAvatarProfile.js';

describe('publicAvatarProfile', () => {
  it('membuat proyeksi publik dengan URL foto hasil unggah', () => {
    expect(publicAvatarProfile('user-1', ' Budi ', ' https://media.example/avatar.webp ')).toEqual({
      uid: 'user-1',
      displayName: 'Budi',
      photoURL: 'https://media.example/avatar.webp'
    });
  });

  it('mengosongkan URL foto saat foto profil dihapus', () => {
    expect(publicAvatarProfile('user-1', 'Budi', '')).toEqual({
      uid: 'user-1',
      displayName: 'Budi',
      photoURL: ''
    });
  });

  it('menggunakan nama fallback jika nama profil kosong', () => {
    expect(publicAvatarProfile('user-1', '  ', 'https://media.example/avatar.webp').displayName).toBe('Anggota WarkopLink');
  });
});
