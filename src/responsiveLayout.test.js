import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('./ui-2026.css', import.meta.url), 'utf8');

describe('responsive navigation contract', () => {
  it('hides the compact bottom navigation at desktop widths', () => {
    expect(styles).toMatch(/@media \(min-width: 761px\)\s*\{\s*\.bottom-nav \{ display: none !important;/);
  });

  it('shows bottom navigation and hides desktop rails on compact widths', () => {
    expect(styles).toMatch(/@media \(max-width: 760px\)\s*\{[\s\S]*?\.desktop-sidebar,[\s\S]*?\.desktop-right-rail \{ display: none !important; \}/);
    expect(styles).toMatch(/\.bottom-nav\s*\{\s*display: grid !important;/);
    expect(styles).toContain('env(safe-area-inset-bottom, 0px)');
  });

  it('keeps a deliberate narrow-phone override', () => {
    expect(styles).toContain('@media (max-width: 360px)');
  });
});
