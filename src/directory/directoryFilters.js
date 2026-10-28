// Fungsi murni untuk menyaring daftar warkop yang sudah dimuat. Tidak mengubah skema data.

export const PRICE_FILTER_OPTIONS = [
  { value: 'semua', label: 'Semua harga' },
  { value: 'hemat', label: 'Hemat' },
  { value: 'sedang', label: 'Sedang' },
  { value: 'premium', label: 'Premium' }
];

export function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('id')
    .replace(/\s+/g, ' ')
    .trim();
}

// Daftar fasilitas unik (terurut) dari data yang sudah dimuat, untuk pilihan filter.
export function collectFacilities(items) {
  const seen = new Map();
  for (const item of items || []) {
    for (const facility of Array.isArray(item?.facilities) ? item.facilities : []) {
      const key = normalizeSearchText(facility);
      if (key && !seen.has(key)) seen.set(key, String(facility).trim());
    }
  }
  return [...seen.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'id'))
    .map(([key, label]) => ({ key, label }));
}

export function filterWarungs(items, { search = '', price = 'semua', facilities = [] } = {}) {
  const needle = normalizeSearchText(search);
  const wanted = facilities.map(normalizeSearchText).filter(Boolean);
  return (items || []).filter((item) => {
    if (price !== 'semua' && item.priceRange !== price) return false;
    const itemFacilities = (Array.isArray(item.facilities) ? item.facilities : []).map(normalizeSearchText);
    if (!wanted.every((facility) => itemFacilities.includes(facility))) return false;
    if (!needle) return true;
    const haystack = normalizeSearchText([item.name, item.address, ...itemFacilities].join(' '));
    return haystack.includes(needle);
  });
}
