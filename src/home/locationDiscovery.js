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

export function filterWarungsByLocation(warungs = [], location = { mode: 'all' }) {
  const records = Array.isArray(warungs) ? warungs : [];
  if (location?.mode === 'region') {
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
