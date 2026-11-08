export const MENU_ITEM_SCHEMA_VERSION = 1;
export const MAX_MENU_SEARCH_TOKENS = 12;
export const MENU_CATEGORIES = Object.freeze([
  { id: 'coffee', label: 'Kopi' }, { id: 'non_coffee', label: 'Non-Kopi' },
  { id: 'snacks', label: 'Camilan' }, { id: 'main_meals', label: 'Makanan Utama' },
  { id: 'bakery_dessert', label: 'Roti & Dessert' }, { id: 'bundles_promos', label: 'Paket & Promo' },
  { id: 'other', label: 'Lainnya' },
]);
export const MENU_CATEGORY_IDS = Object.freeze(MENU_CATEGORIES.map(({ id }) => id));
export const MENU_TAGS = Object.freeze(['best_seller', 'signature', 'new', 'recommended', 'promo', 'spicy', 'non_spicy', 'vegetarian', 'halal', 'hot', 'iced', 'seasonal']);
export const MENU_PRICE_TYPES = Object.freeze(['fixed', 'starting', 'unlisted']);
export const MENU_STATUSES = Object.freeze(['draft', 'published', 'archived']);
export const MENU_AVAILABILITY = Object.freeze(['available', 'limited', 'sold_out']);
export const MENU_SOURCES = Object.freeze(['native', 'legacy-specialties']);
export const MENU_ITEM_FIELDS = Object.freeze([
  'schemaVersion', 'warungId', 'ownerUid', 'name', 'nameNormalized', 'description',
  'categoryId', 'tags', 'priceType', 'priceAmount', 'currency', 'photoUrl', 'status',
  'availability', 'isPublic', 'source', 'sortOrder', 'searchTokens', 'regionCode',
  'provinceCode', 'regencyCode', 'districtCode', 'villageCode', 'createdAt', 'updatedAt',
]);
export const MENU_ITEM_SCHEMA = Object.freeze({
  collection: 'warungMenuItems', schemaVersion: MENU_ITEM_SCHEMA_VERSION, fields: MENU_ITEM_FIELDS,
  currency: 'IDR', name: { minLength: 2, maxLength: 80 }, description: { maxLength: 300 },
  searchTokens: { maxItems: MAX_MENU_SEARCH_TOKENS }, priceTypes: MENU_PRICE_TYPES,
  statuses: MENU_STATUSES, availability: MENU_AVAILABILITY, sources: MENU_SOURCES,
  categories: MENU_CATEGORIES, tags: MENU_TAGS,
});
const hasText = (value) => typeof value === 'string' && value.trim().length > 0;

export function normalizeMenuName(value) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC').toLocaleLowerCase('id-ID')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function buildMenuSearchTokens(values, limit = MAX_MENU_SEARCH_TOKENS) {
  const maxTokens = Number.isInteger(limit) ? Math.min(MAX_MENU_SEARCH_TOKENS, Math.max(0, limit)) : MAX_MENU_SEARCH_TOKENS;
  const sourceValues = Array.isArray(values) ? values : [values];
  const tokens = [];
  const seen = new Set();
  for (const value of sourceValues) {
    if (typeof value !== 'string') continue;
    for (const token of normalizeMenuName(value).split(' ')) {
      if (!token || seen.has(token)) continue;
      seen.add(token);
      tokens.push(token);
      if (tokens.length >= maxTokens) return tokens;
    }
  }
  return tokens;
}

export async function createLegacyMenuItemId(warungId, name) {
  if (!hasText(warungId)) throw new TypeError('warungId wajib diisi.');
  const normalized = normalizeMenuName(name);
  if (!normalized) throw new TypeError('Nama menu wajib diisi untuk membuat ID.');
  const payload = new TextEncoder().encode(warungId.trim() + '|' + normalized);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', payload);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function formatMenuPrice(priceAmount, priceType = 'fixed') {
  if (priceType === 'unlisted') return 'Harga belum dicantumkan';
  if (!['fixed', 'starting'].includes(priceType)) throw new TypeError('priceType tidak valid.');
  if (typeof priceAmount !== 'number' || !Number.isFinite(priceAmount) || priceAmount < 0) {
    throw new TypeError('Harga harus berupa angka non-negatif.');
  }
  const amount = 'Rp' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0, useGrouping: true }).format(priceAmount);
  return priceType === 'starting' ? 'Mulai ' + amount : amount;
}

export function buildMenuRegionSnapshot(warung = {}) {
  return {
    regionCode: typeof warung.villageCode === 'string' ? warung.villageCode : null,
    provinceCode: typeof warung.provinceCode === 'string' ? warung.provinceCode : null,
    regencyCode: typeof warung.regencyCode === 'string' ? warung.regencyCode : null,
    districtCode: typeof warung.districtCode === 'string' ? warung.districtCode : null,
    villageCode: typeof warung.villageCode === 'string' ? warung.villageCode : null,
  };
}

export function validateMenuItem(input) {
  const errors = [];
  const data = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  for (const field of MENU_ITEM_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(data, field)) errors.push(field + ' wajib tersedia.');
  }
  if (data.schemaVersion !== MENU_ITEM_SCHEMA_VERSION) errors.push('schemaVersion tidak didukung.');
  if (!hasText(data.warungId)) errors.push('warungId wajib berupa teks.');
  if (!hasText(data.ownerUid)) errors.push('ownerUid wajib berupa teks.');
  if (typeof data.name !== 'string' || data.name.trim().length < 2 || data.name.trim().length > 80) errors.push('name harus 2–80 karakter.');
  if (typeof data.nameNormalized !== 'string' || data.nameNormalized !== normalizeMenuName(data.name)) errors.push('nameNormalized harus sesuai hasil normalisasi name.');
  if (typeof data.description !== 'string' || data.description.length > 300) errors.push('description wajib berupa teks maksimal 300 karakter.');
  if (!MENU_CATEGORY_IDS.includes(data.categoryId)) errors.push('categoryId tidak termasuk kategori resmi.');
  if (!Array.isArray(data.tags) || data.tags.some((tag) => !MENU_TAGS.includes(tag))) errors.push('tags harus berupa daftar tag resmi.');
  if (!MENU_PRICE_TYPES.includes(data.priceType)) errors.push('priceType tidak valid.');
  if (data.priceType === 'unlisted' && data.priceAmount !== null) errors.push('priceAmount harus null jika priceType unlisted.');
  if (['fixed', 'starting'].includes(data.priceType) && (typeof data.priceAmount !== 'number' || !Number.isFinite(data.priceAmount))) errors.push('priceAmount wajib berupa angka untuk fixed/starting.');
  if (typeof data.priceAmount === 'number' && (!Number.isFinite(data.priceAmount) || data.priceAmount < 0)) errors.push('priceAmount tidak boleh negatif dan harus numerik.');
  if (data.currency !== 'IDR') errors.push('currency harus IDR.');
  if (data.photoUrl !== null && typeof data.photoUrl !== 'string') errors.push('photoUrl harus berupa teks atau null.');
  if (!MENU_STATUSES.includes(data.status)) errors.push('status tidak valid.');
  if (!MENU_AVAILABILITY.includes(data.availability)) errors.push('availability tidak valid.');
  if (typeof data.isPublic !== 'boolean') errors.push('isPublic harus boolean.');
  if (!MENU_SOURCES.includes(data.source)) errors.push('source tidak valid.');
  if (!Number.isInteger(data.sortOrder) || data.sortOrder < 0) errors.push('sortOrder harus bilangan bulat non-negatif.');
  if (!Array.isArray(data.searchTokens) || data.searchTokens.length > MAX_MENU_SEARCH_TOKENS || data.searchTokens.some((token) => typeof token !== 'string' || !token)) {
    errors.push('searchTokens harus berisi maksimal ' + MAX_MENU_SEARCH_TOKENS + ' token teks.');
  }
  for (const field of ['regionCode', 'provinceCode', 'regencyCode', 'districtCode', 'villageCode']) {
    if (data[field] !== null && typeof data[field] !== 'string') errors.push(field + ' harus berupa teks atau null.');
  }
  if (data.regionCode !== data.villageCode) errors.push('regionCode harus sama dengan villageCode.');
  if (data.createdAt == null) errors.push('createdAt wajib tersedia.');
  if (data.updatedAt == null) errors.push('updatedAt wajib tersedia.');
  return { valid: errors.length === 0, errors };
}
