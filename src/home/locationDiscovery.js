const EARTH_RADIUS_KM = 6371;

function validCoordinates(value) {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

function distanceInKm(from, to) {
  const radians = value => value * (Math.PI / 180);
  const latDelta = radians(to.lat - from.lat);
  const lngDelta = radians(to.lng - from.lng);
  const a = Math.sin(latDelta / 2) ** 2 + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(lngDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, a)));
}

function searchableRegion(record) {
  return [record?.name, record?.address, record?.villageName, record?.districtName, record?.regencyName, record?.provinceName, record?.regionName].filter(Boolean).join(' ').toLocaleLowerCase('id-ID');
}

function searchableAdministrativeAddress(record) {
  return [record?.address, record?.villageName, record?.districtName, record?.regencyName, record?.provinceName, record?.regionName].filter(Boolean).join(' ').toLocaleLowerCase('id-ID');
}

function matchesOfficialRegion(record, region) {
  if (!record || !region) return false;
  const level = region.scopeLevel || region.selectedLevel || (region.villageCode ? 'village' : region.districtCode ? 'district' : region.regencyCode ? 'regency' : region.provinceCode ? 'province' : '');
  const code = String(region.selectedCode || region[level + 'Code'] || '').trim();
  const name = String(region.selectedName || region[level + 'Name'] || '').trim().toLocaleLowerCase('id-ID');
  if (!level || !code) return false;
  const fields = { province: ['provinceCode','regencyCode','districtCode','villageCode','regionCode'], regency: ['regencyCode','districtCode','villageCode','regionCode'], district: ['districtCode','villageCode','regionCode'], village: ['villageCode','regionCode'] }[level] || [];
  for (const field of fields) {
    const stored = String(record[field] || '').trim();
    if (stored && (stored === code || stored.startsWith(code + '.'))) return true;
  }
  const nameField = { province: 'provinceName', regency: 'regencyName', district: 'districtName', village: 'villageName' }[level];
  const storedName = String(record[nameField] || '').trim().toLocaleLowerCase('id-ID');
  if (name && storedName) return storedName === name;
  return Boolean(name.length > 1 && searchableAdministrativeAddress(record).includes(name));
}

export function filterWarungsByLocation(warungs = [], location = { mode: 'all' }) {
  const records = Array.isArray(warungs) ? warungs : [];
  if (location?.mode === 'region') {
    if (location.region) return records.filter(record => matchesOfficialRegion(record, location.region));
    const query = String(location.query || '').trim().toLocaleLowerCase('id-ID');
    return query ? records.filter(record => searchableRegion(record).includes(query)) : records;
  }
  if (location?.mode !== 'nearby') return records;
  const origin = validCoordinates(location.coordinates);
  if (!origin) return records;
  return records.flatMap(record => {
    const coordinates = validCoordinates(record?.coordinates);
    return coordinates ? [{ ...record, distanceKm: distanceInKm(origin, coordinates) }] : [];
  }).sort((left, right) => left.distanceKm - right.distanceKm);
}

export function filterPostsByLocation(posts = [], location = { mode: 'all' }, warungs = []) {
  const records = Array.isArray(posts) ? posts : [];
  if (!location || location.mode === 'all') return records;
  const warungById = new Map((Array.isArray(warungs) ? warungs : []).map(item => [item.id, item]));
  const nearbyIds = location.mode === 'nearby' ? new Set(filterWarungsByLocation(warungs, location).map(item => item.id)) : null;
  return records.filter(post => {
    if (post?.warungId && warungById.has(post.warungId)) {
      if (location.mode === 'nearby') return nearbyIds.has(post.warungId);
      return matchesOfficialRegion(warungById.get(post.warungId), location.region) || (!location.region && searchableRegion(warungById.get(post.warungId)).includes(String(location.query || '').toLocaleLowerCase('id-ID')));
    }
    if (location.mode === 'nearby') return false;
    if (location.region && matchesOfficialRegion(post, location.region)) return true;
    const region = location.region;
    const level = region?.scopeLevel || region?.selectedLevel || (region?.villageCode ? 'village' : region?.districtCode ? 'district' : region?.regencyCode ? 'regency' : region?.provinceCode ? 'province' : '');
    const name = String(region?.selectedName || region?.[level + 'Name'] || '').trim().toLocaleLowerCase('id-ID');
    const text = typeof post?.location === 'string' ? post.location.toLocaleLowerCase('id-ID') : '';
    if (location.region) return Boolean(name.length > 1 && text.includes(name));
    const query = String(location.query || '').trim().toLocaleLowerCase('id-ID');
    return Boolean(query && text.includes(query));
  });
}
