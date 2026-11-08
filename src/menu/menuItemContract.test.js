import { describe, expect, it } from 'vitest';
import { MENU_CATEGORIES, MENU_ITEM_FIELDS, MENU_TAGS, buildMenuRegionSnapshot, buildMenuSearchTokens, createLegacyMenuItemId, formatMenuPrice, normalizeMenuName, validateMenuItem } from './menuItemContract.js';

const validMenuItem = (overrides = {}) => {
  const region = buildMenuRegionSnapshot({ provinceCode: '35', regencyCode: '35.24', districtCode: '35.24.01', villageCode: '35.24.01.2001' });
  return {
    schemaVersion: 1, warungId: 'warung-1', ownerUid: 'owner-1', name: 'Kopi Susu', nameNormalized: 'kopi susu',
    description: '', categoryId: 'coffee', tags: ['best_seller'], priceType: 'fixed', priceAmount: 18000,
    currency: 'IDR', photoUrl: null, status: 'draft', availability: 'available', isPublic: false,
    source: 'native', sortOrder: 0, searchTokens: ['kopi', 'susu'], ...region,
    createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z'), ...overrides,
  };
};

describe('Menu Spesial data contract', () => {
  it('declares document fields and official categories/tags', () => {
    expect(MENU_ITEM_FIELDS).toContain('warungId');
    expect(MENU_ITEM_FIELDS).toContain('regionCode');
    expect(MENU_ITEM_FIELDS).toContain('searchTokens');
    expect(MENU_CATEGORIES.map(({ id }) => id)).toEqual(['coffee', 'non_coffee', 'snacks', 'main_meals', 'bakery_dessert', 'bundles_promos', 'other']);
    expect(MENU_TAGS).toContain('best_seller');
  });
  it('accepts an unlisted menu with null price', () => {
    expect(validateMenuItem(validMenuItem({ priceType: 'unlisted', priceAmount: null })).valid).toBe(true);
  });
  it('requires a numeric amount for starting prices', () => {
    expect(validateMenuItem(validMenuItem({ priceType: 'starting', priceAmount: 15000 })).valid).toBe(true);
    expect(validateMenuItem(validMenuItem({ priceType: 'starting', priceAmount: null })).valid).toBe(false);
  });
  it('rejects negative and non-numeric prices', () => {
    expect(validateMenuItem(validMenuItem({ priceAmount: -1 })).valid).toBe(false);
    expect(validateMenuItem(validMenuItem({ priceAmount: '18000' })).valid).toBe(false);
  });
  it('rejects an empty name', () => {
    const result = validateMenuItem(validMenuItem({ name: '', nameNormalized: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('name harus 2–80 karakter.');
  });
  it('rejects names longer than 80 characters', () => {
    const name = 'a'.repeat(81);
    expect(validateMenuItem(validMenuItem({ name, nameNormalized: name })).valid).toBe(false);
  });
  it('normalizes duplicate names that differ only by letter case', () => {
    expect(normalizeMenuName('KOPI SUSU')).toBe(normalizeMenuName('Kopi Susu'));
    expect(normalizeMenuName('Kopi Susu')).toBe('kopi susu');
  });
  it('normalizes repeated spaces and excessive punctuation', () => {
    expect(normalizeMenuName('  Kopi---   Susu!!! @@@ ')).toBe('kopi susu');
    expect(normalizeMenuName('!!!')).toBe('');
    expect(validateMenuItem(validMenuItem({ name: '!!!', nameNormalized: '' })).valid).toBe(false);
  });
  it('builds unique search tokens within the configured limit', () => {
    expect(buildMenuSearchTokens(['Kopi Susu', 'kopi gula aren', 'Signature'], 4)).toEqual(['kopi', 'susu', 'gula', 'aren']);
    expect(buildMenuSearchTokens('Kopi Susu')).toEqual(['kopi', 'susu']);
    expect(buildMenuSearchTokens('Kopi Susu', 0)).toEqual([]);
  });
  it('creates the same SHA-256 ID for equivalent normalized names', async () => {
    const first = await createLegacyMenuItemId('warung-1', 'Kopi Susu');
    const second = await createLegacyMenuItemId('warung-1', 'KOPI   SUSU!!!');
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });
  it('changes the migration ID when the warung or normalized name changes', async () => {
    const original = await createLegacyMenuItemId('warung-1', 'Kopi Susu');
    await expect(createLegacyMenuItemId('warung-2', 'Kopi Susu')).resolves.not.toBe(original);
    await expect(createLegacyMenuItemId('warung-1', 'Kopi Hitam')).resolves.not.toBe(original);
  });
  it('formats fixed, starting, and unlisted prices as Indonesian rupiah', () => {
    expect(formatMenuPrice(18000, 'fixed')).toBe('Rp18.000');
    expect(formatMenuPrice(15000, 'starting')).toBe('Mulai Rp15.000');
    expect(formatMenuPrice(null, 'unlisted')).toBe('Harga belum dicantumkan');
  });
  it('copies region hierarchy and derives regionCode from villageCode', () => {
    expect(buildMenuRegionSnapshot({ regionCode: 'wrong', provinceCode: '35', regencyCode: '35.24', districtCode: '35.24.01', villageCode: '35.24.01.2001' })).toEqual({
      regionCode: '35.24.01.2001', provinceCode: '35', regencyCode: '35.24', districtCode: '35.24.01', villageCode: '35.24.01.2001',
    });
  });
});
