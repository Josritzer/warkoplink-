import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync('src/ui-2026.css', 'utf8');
const mobileSafetyStyles = readFileSync('src/mobile-layout-safety.css', 'utf8');

describe('responsivitas navigasi WarkopLink', () => {
  it('menyembunyikan navigasi bawah di desktop', () => {
    expect(styles).toMatch(/@media \(min-width: 761px\)\s*\{[\s\S]*?\.bottom-nav \{ display: none !important;/);
  });
  it('memakai navigasi bawah dan menyembunyikan sidebar di HP', () => {
    expect(styles).toMatch(/@media \(max-width: 760px\)\s*\{[\s\S]*?\.desktop-sidebar, \.desktop-right-rail \{ display: none !important; \}/);
    expect(styles).toContain('grid-template-columns: repeat(5, minmax(0, 1fr))');
    expect(styles).toContain('env(safe-area-inset-bottom, 0px)');
  });
  it('menangani layar sangat sempit dan preferensi reduced motion', () => {
    expect(styles).toContain('@media (max-width: 360px)');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });
});


describe('penerimaan layout feed mobile', () => {
  it('menyisakan ruang scroll di bawah feed setelah navigasi tetap dan safe area', () => {
    expect(mobileSafetyStyles).toContain('padding-bottom: calc(132px + env(safe-area-inset-bottom, 0px))');
  });

  it('memakai header ringkas dan tiga aksi feed tanpa kotak pada ponsel', () => {
    expect(mobileSafetyStyles).toContain('.app-header { height: 58px; min-height: 58px; }');
    expect(mobileSafetyStyles).toContain('#community-feed .post-card { gap: 8px; padding: 11px; border-radius: 12px; }');
    expect(mobileSafetyStyles).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(mobileSafetyStyles).toContain('min-height: 44px');
  });


  it('menjaga label aksi utuh, rasio video intrinsik, dan kontras state Suka pada 360–390 px', () => {
    expect(mobileSafetyStyles).toContain('white-space: nowrap;');
    expect(mobileSafetyStyles).toContain('word-break: keep-all;');
    expect(mobileSafetyStyles).toContain('aspect-ratio: auto !important;');
    expect(mobileSafetyStyles).toContain('object-fit: contain;');
    expect(mobileSafetyStyles).toContain('.like-toggle[aria-pressed="true"]');
    expect(mobileSafetyStyles).toContain('padding-bottom: calc(136px + env(safe-area-inset-bottom, 0px))');
    expect(mobileSafetyStyles).toContain('@media (max-width: 390px)');
  });

  it('memakai teks sekunder berkontras dan kontrol video terpisah dari area gambar', () => {
    expect(mobileSafetyStyles).toContain('#community-feed .post-meta small');
    expect(mobileSafetyStyles).toContain('color: var(--wl-ink)');
    expect(mobileSafetyStyles).toContain('.feed-video-controls');
    expect(mobileSafetyStyles).toContain('min-height: 44px');
  });
});
