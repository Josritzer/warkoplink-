import { describe, expect, it } from 'vitest';
import { resolveAuthorPhotoURL, withAuthorPhotos } from './authorPhotos.js';

describe('author photo fallback', () => {
  it('uses the latest public profile photo for an older post without a stored photo', () => {
    const post = { id: 'post-1', authorId: 'user-1', authorPhotoURL: null };
    expect(resolveAuthorPhotoURL(post, { 'user-1': 'https://cdn.example/avatar.webp' }))
      .toBe('https://cdn.example/avatar.webp');
  });

  it('prefers the current public profile photo over a stale photo copied into a post', () => {
    const post = { id: 'post-1', authorId: 'user-1', authorPhotoURL: 'https://old.example/avatar.webp' };
    expect(resolveAuthorPhotoURL(post, { 'user-1': 'https://new.example/avatar.webp' }))
      .toBe('https://new.example/avatar.webp');
  });

  it('keeps a post photo when no public profile photo is available', () => {
    const post = { id: 'post-1', authorId: 'user-1', authorPhotoURL: 'https://post.example/avatar.webp' };
    expect(resolveAuthorPhotoURL(post, {})).toBe('https://post.example/avatar.webp');
  });

  it('enriches feed records without mutating their stored source objects', () => {
    const posts = [{ id: 'post-1', authorId: 'user-1', authorPhotoURL: null }];
    const enriched = withAuthorPhotos(posts, { 'user-1': 'https://cdn.example/avatar.webp' });
    expect(enriched[0].authorPhotoURL).toBe('https://cdn.example/avatar.webp');
    expect(posts[0].authorPhotoURL).toBeNull();
  });
});
