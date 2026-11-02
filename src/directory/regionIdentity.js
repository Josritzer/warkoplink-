const slugify = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

export function buildRegionIdentity(provinceName, regencyName) {
  const province = String(provinceName || '').trim().replace(/\s+/g, ' ');
  const regency = String(regencyName || '').trim().replace(/\s+/g, ' ');
  if (province.length < 2 || province.length > 80 || regency.length < 2 || regency.length > 80) {
    throw new Error('Nama provinsi dan kabupaten/kota harus 2–80 karakter.');
  }
  const provinceSlug = slugify(province);
  const regencySlug = slugify(regency);
  if (!provinceSlug || !regencySlug) throw new Error('Nama wilayah tidak valid.');
  return {
    regionCode: `id-${provinceSlug}-${regencySlug}`,
    provinceName: province,
    regencyName: regency,
  };
}
