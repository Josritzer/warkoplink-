import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const feedStyles = readFileSync('src/chat-2026.css', 'utf8');

describe('feed video native controls', () => {
  it('keeps the centered play bubble compact on mobile browsers', () => {
    expect(feedStyles).toMatch(/\.feed-video-frame\s+video::-webkit-media-controls-overlay-play-button\s*\{[^}]*width:\s*48px[^}]*height:\s*48px/s);
  });

  it('keeps the control-bar play/pause button compact', () => {
    expect(feedStyles).toMatch(/\.feed-video-frame\s+video::-webkit-media-controls-play-button\s*\{[^}]*width:\s*28px[^}]*height:\s*28px/s);
  });
});
