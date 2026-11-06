const EARTH_RADIUS_KM = 6371;

function validCoordinates(value) {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat, lng }
    : null;
}

function distanceInKm(from, to) {
  const radians = value => value * (Math.PI / 180);
  const latDelta = radians(to.lat - from.lat);
  const lngDelta = radians(to.lng - from.lng);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(lngDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, a)));
}

function searchableRegion(warung) {
  return [
    warung?.name, warung?.address, warung?.villageName, warung?.districtName,
    warung?.regencyName, warung?.provinceName, warung?.regionName
  ].filter(Boolean).join(' ').toLocaleLowerCase('id-ID');
}

function matchesOfficialRegion(record, region) {
  if (!region) return false;
  const levels = ['province', 'regency', 'district', 'village'];
  const selectedLevel = [...levels].reverse().find(level => region[`${level}Code`]);
  if (selectedLevel) {
    const code = region[`${selectedLevel}Code`];
    const storedCode = record?.[`${selectedLevel}Code`]
      || (selectedLevel === 'village' ? record?.regionCode : '');
    if (storedCode === code) return true;
    const name = String(region[`${selectedLevel}Name`] || '').trim().toLocaleLowerCase('id-ID');
    return Boolean(name.length > 1 && searchableRegion(record).includes(name));
  }
  return false;
}

export function filterWarungsByLocation(warungs = [], location = { mode: 'all' }) {
  const records = Array.isArray(warungs) ? warungs : [];
  if (location?.mode === 'region') {
    if (location.region) return records.filter(warung => matchesOfficialRegion(warung, location.region));
    const query = String(location.query || '').trim().toLocaleLowerCase('id-ID');
    return query ? records.filter(warung => searchableRegion(warung).includes(query)) : records;
  }
  if (location?.mode !== 'nearby') return records;

  const origin = validCoordinates(location.coordinates);
  if (!origin) return records;

  return records.flatMap(warung => {
    const coordinates = validCoordinates(warung?.coordinates);
    if (!coordinates) return [];
    return [{ ...warung, distanceKm: distanceInKm(origin, coordinates) }];
  }).sort((left, right) => left.distanceKm - right.distanceKm);
}


export function filterPostsByLocation(posts = [], location = { mode: 'all' }, warungs = []) {
  const records = Array.isArray(posts) ? posts : [];
  if (!location || location.mode === 'all') return records;
  const warungById = new Map((Array.isArray(warungs) ? warungs : []).map(item => [item.id, item]));
  const nearbyWarungIds = location.mode === 'nearby'
    ? new Set(filterWarungsByLocation(warungs, location).map(item => item.id))
    : null;
  return records.filter(post => {
    if (post?.warungId && warungById.has(post.warungId)) {
      if (location.mode === 'nearby') return nearbyWarungIds.has(post.warungId);
      return matchesOfficialRegion(warungById.get(post.warungId), location.region)
        || (!location.region && searchableRegion(warungById.get(post.warungId)).includes(String(location.query || '').toLocaleLowerCase('id-ID')));
    }
    if (location.mode === 'nearby') return false;
    const text = String(post?.location || '').toLocaleLowerCase('id-ID');
    const region = location.region;
    if (region) {
      const village = String(region.villageName || '').trim().toLocaleLowerCase('id-ID');
      return village.length > 1 && text.includes(village);
    }
    const query = String(location.query || '').trim().toLocaleLowerCase('id-ID');
    return Boolean(query && text.includes(query));
  });
}
