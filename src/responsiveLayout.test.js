import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync('src/ui-2026.css', 'utf8');

describe('responsivitas navigasi WarkopLink', () => {
  it('menyembunyikan navigasi bawah di desktop', () => {
    expect(styles).toMatch(/@media \(min-width: 761px\)\s*\{[\s\S]*?\.bottom-nav \{ display: none !important;/);
  });
  it('memakai navigasi bawah dan menyembunyikan sidebar di HP', () => {
    expect(styles).toMatch(/@media \(max-width: 760px\)\s*\{[\s\S]*?\.desktop-sidebar, \.desktop-right-rail \{ display: none !important; \}/);
    expect(styles).toContain('grid-template-columns: repeat(6, minmax(0, 1fr))');
    expect(styles).toContain('env(safe-area-inset-bottom, 0px)');
  });
  it('menangani layar sangat sempit dan preferensi reduced motion', () => {
    expect(styles).toContain('@media (max-width: 360px)');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
