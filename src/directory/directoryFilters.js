// Filter direktori berbasis data profil yang eksplisit; kompatibel dengan profil lama.
export const ACTIVITY_OPTIONS = [
  { value: 'nobar', label: 'Nobar' },
  { value: 'komunitas', label: 'Komunitas' },
  { value: 'gim', label: 'Gim' },
  { value: 'kerja-laptop', label: 'Bekerja dengan laptop' },
  { value: 'acara', label: 'Acara' },
  { value: 'olahraga', label: 'Olahraga' },
  { value: 'hobi', label: 'Hobi' },
  { value: 'musik', label: 'Musik / live music' },
  { value: 'ngopi-bareng', label: 'Ngopi bareng' }
];

export const ACTIVITY_LABELS = Object.fromEntries(ACTIVITY_OPTIONS.map(({ value, label }) => [value, label]));

// Nilai harus sama dengan yang diizinkan firestore.rules (selain 'belum-diisi', yang tidak bisa dipilih sebagai filter).
export const PRICE_OPTIONS = [
  { value: 'hemat', label: 'Hemat' },
  { value: 'sedang', label: 'Sedang' },
  { value: 'premium', label: 'Premium' }
];

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('id')
    .replace(/\s+/g, ' ')
    .trim();
}

export function collectFacilities(items) {
  const counts = new Map();
  for (const item of items || []) {
    const unique = new Map();
    for (const facility of Array.isArray(item?.facilities) ? item.facilities : []) {
      const key = normalizeSearchText(facility);
      if (key && !unique.has(key)) unique.set(key, String(facility).trim());
    }
    for (const [key, label] of unique) {
      const current = counts.get(key) || { key, label, count: 0 };
      current.count += 1;
      counts.set(key, current);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, 'id'));
}

export function collectActivities(items) {
  const present = new Set();
  for (const item of items || []) {
    for (const activity of Array.isArray(item?.activities) ? item.activities : []) {
      const key = normalizeSearchText(activity);
      if (ACTIVITY_LABELS[key]) present.add(key);
    }
  }
  return ACTIVITY_OPTIONS.filter(({ value }) => present.has(value)).map(({ value, label }) => ({ key: value, label }));
}

function parseClock(value) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function jakartaParts(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekday = ({ Sun: 'sun', Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat' })[values.weekday];
  const hour = Number(values.hour);
  const minute = Number(values.minute);
  if (!weekday || !Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  return { weekday, minuteOfDay: hour * 60 + minute };
}

function validDayEntry(entry) {
  if (entry && entry.closed === true) return true;
  if (!entry || typeof entry !== 'object') return false;
  const open = parseClock(entry.open);
  const close = parseClock(entry.close);
  return open !== null && close !== null && open !== close;
}

// Returns true/false only when the whole weekly schedule is complete and valid.
// null means the app must not claim that the place is open or closed.
export function isOpenNow(warung, now = new Date()) {
  const hours = warung?.openingHours;
  if (hours?.is24Hours === true) return true;
  const schedule = hours?.schedule;
  if (!schedule || typeof schedule !== 'object' || !WEEKDAYS.every((day) => validDayEntry(schedule[day]))) return null;
  const local = jakartaParts(now);
  if (!local) return null;

  const dayIndex = WEEKDAYS.indexOf(local.weekday);
  const today = schedule[local.weekday];
  const previousDay = schedule[WEEKDAYS[(dayIndex + 6) % 7]];
  const previousOpen = parseClock(previousDay?.open);
  const previousClose = parseClock(previousDay?.close);
  if (previousDay?.closed !== true && previousOpen !== null && previousClose !== null
    && previousClose < previousOpen && local.minuteOfDay < previousClose) return true;
  if (today?.closed === true) return false;

  const open = parseClock(today.open);
  const close = parseClock(today.close);
  if (open === null || close === null || open === close) return null;
  if (close > open) return local.minuteOfDay >= open && local.minuteOfDay < close;
  return local.minuteOfDay >= open || local.minuteOfDay < close;
}

// priceRange: 'semua' (default) tidak menyaring; nilai lain hanya cocok dengan data yang mengisi kisaran harga persis itu.
export function filterWarungs(items, { search = '', facilities = [], activities = [], operational = 'semua', priceRange = 'semua', now = new Date() } = {}) {
  const needle = normalizeSearchText(search);
  const wantedFacilities = facilities.map(normalizeSearchText).filter(Boolean);
  const wantedActivities = activities.map(normalizeSearchText).filter(Boolean);
  return (items || []).filter((item) => {
    const itemFacilities = (Array.isArray(item?.facilities) ? item.facilities : []).map(normalizeSearchText);
    const itemActivities = (Array.isArray(item?.activities) ? item.activities : []).map(normalizeSearchText);
    if (!wantedFacilities.every((facility) => itemFacilities.includes(facility))) return false;
    if (wantedActivities.length && !wantedActivities.some((activity) => itemActivities.includes(activity))) return false;
    if (priceRange !== 'semua' && item?.priceRange !== priceRange) return false;
    if (operational === 'buka-24-jam' && item?.openingHours?.is24Hours !== true) return false;
    if (operational === 'buka-sekarang' && isOpenNow(item, now) !== true) return false;
    if (!needle) return true;
    const haystack = normalizeSearchText([
      item?.name, item?.nameNormalized, item?.address, item?.provinceName, item?.regencyName, item?.districtName, item?.villageName, item?.ambience,
      ...(Array.isArray(item?.menuItems) ? item.menuItems : []),
      ...(Array.isArray(item?.specialties) ? item.specialties : []),
      ...(Array.isArray(item?.facilities) ? item.facilities : []),
      ...(Array.isArray(item?.activities) ? item.activities : [])
    ].join(' '));
    return haystack.includes(needle);
  });
}


// Mendahulukan kecocokan nama, lalu menu, lokasi, dan metadata lain yang dicari pengguna.
function searchMatchScore(item, needle) {
  const name = normalizeSearchText(item?.nameNormalized || item?.name);
  if (name === needle) return 100;
  if (name.startsWith(needle)) return 90;
  if (name.includes(needle)) return 80;
  const menu = [...(Array.isArray(item?.menuItems) ? item.menuItems : []), ...(Array.isArray(item?.specialties) ? item.specialties : [])].map(normalizeSearchText);
  if (menu.some((value) => value === needle)) return 70;
  if (menu.some((value) => value.startsWith(needle))) return 60;
  if (menu.some((value) => value.includes(needle))) return 50;
  const locations = [item?.address, item?.villageName, item?.districtName, item?.regencyName, item?.provinceName].map(normalizeSearchText);
  if (locations.some((value) => value === needle)) return 45;
  if (locations.some((value) => value.includes(needle))) return 40;
  const other = [item?.ambience, ...(Array.isArray(item?.facilities) ? item.facilities : []), ...(Array.isArray(item?.activities) ? item.activities : [])].map(normalizeSearchText);
  return other.some((value) => value.includes(needle)) ? 30 : 0;
}

export function sortWarungsBySearchRelevance(items, search) {
  const needle = normalizeSearchText(search);
  if (!needle) return [...(items || [])];
  return [...(items || [])].sort((a, b) => searchMatchScore(b, needle) - searchMatchScore(a, needle));
}

// Number(null), Number('') dan Number(true) bernilai 0/1, sehingga data rusak tampak
// sebagai koordinat valid. Hanya angka atau string numerik yang diterima.
function coordinateNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return NaN;
}

export function isValidCoordinate(point) {
  const lat = coordinateNumber(point?.lat);
  const lng = coordinateNumber(point?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export function calculateDistanceKm(origin, destination) {
  if (!isValidCoordinate(origin) || !isValidCoordinate(destination)) return null;
  const lat1 = coordinateNumber(origin.lat);
  const lng1 = coordinateNumber(origin.lng);
  const lat2 = coordinateNumber(destination.lat);
  const lng2 = coordinateNumber(destination.lng);
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function timestampMillis(value) {
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
  if (value && Number.isFinite(value.seconds)) return value.seconds * 1000;
  if (typeof value === 'string' || value instanceof Date) {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function isCurrentOrUpcomingEvent(event, now = new Date()) {
  if (!event || event.topic !== 'Info & Acara' || event.eventStatus === 'cancelled') return false;
  const start = timestampMillis(event.eventStartAt || event.eventDate);
  if (!start) return false;
  const current = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const end = timestampMillis(event.eventEndAt);
  return end ? end >= current : start >= current;
}

export function sortWarungsForDiscovery(items, category, {
  followerCounts = {}, distances = {}, eventWarungIds = [], eventStarts = {}, now = new Date()
} = {}) {
  const rows = [...(items || [])];
  const compareName = (a, b) => String(a.nameNormalized || a.name || '').localeCompare(
    String(b.nameNormalized || b.name || ''), 'id'
  ) || String(a.id).localeCompare(String(b.id));
  if (category === 'popular') {
    return rows.filter((item) => Number(followerCounts[item.id]) > 0).sort((a, b) =>
      (Number(followerCounts[b.id]) || 0) - (Number(followerCounts[a.id]) || 0) || compareName(a, b)
    );
  }
  if (category === 'events') {
    const ids = new Set(eventWarungIds);
    return rows.filter((item) => ids.has(item.id)).sort((a, b) =>
      timestampMillis(eventStarts[a.id]) - timestampMillis(eventStarts[b.id]) || compareName(a, b)
    );
  }
  if (category === 'nearby') {
    return rows.filter((item) => Number.isFinite(distances[item.id])).sort((a, b) =>
      distances[a.id] - distances[b.id] || compareName(a, b)
    );
  }
  if (category === 'specialties') {
    return rows.filter((item) => Array.isArray(item.specialties)
      && item.specialties.some((value) => typeof value === 'string' && value.trim()))
      .sort((a, b) => b.specialties.filter((value) => typeof value === 'string' && value.trim()).length
        - a.specialties.filter((value) => typeof value === 'string' && value.trim()).length || compareName(a, b));
  }
  if (category === 'newest') {
    return rows.sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt) || compareName(a, b));
  }
  const relevanceScore = (item) =>
    (Array.isArray(item.photos) && item.photos.some((photo) => typeof photo === 'string' && photo.trim()) ? 3 : 0)
    + (Array.isArray(item.specialties) ? Math.min(item.specialties.filter(Boolean).length, 3) * 2 : 0)
    + (Array.isArray(item.activities) ? Math.min(item.activities.length, 3) : 0)
    + (Array.isArray(item.facilities) ? Math.min(item.facilities.length, 3) : 0)
    + (isValidCoordinate(item.coordinates) ? 1 : 0)
    + (item.openingHours?.is24Hours === true || item.openingHours?.schedule ? 1 : 0);
  return rows.sort((a, b) => relevanceScore(b) - relevanceScore(a) || compareName(a, b));
}
