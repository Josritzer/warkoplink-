export function parseMapCoordinates(latitude, longitude) {
  if (String(latitude ?? '').trim() === '' || String(longitude ?? '').trim() === '') return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lat, lng];
}

export function getMapInitialView(latitude, longitude) {
  const coordinates = parseMapCoordinates(latitude, longitude);
  return coordinates
    ? { center: coordinates, zoom: 16 }
    : { center: [-7, 112.28], zoom: 12 };
}

export function buildGoogleMapsDirectionsUrl(latitude, longitude) {
  const coordinates = parseMapCoordinates(latitude, longitude);
  if (!coordinates) return null;

  const parameters = new URLSearchParams({
    api: '1',
    destination: coordinates.join(','),
    travelmode: 'driving',
    dir_action: 'navigate',
  });
  return `https://www.google.com/maps/dir/?${parameters.toString()}`;
}
