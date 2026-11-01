// Filter direktori berbasis data profil yang eksplisit; kompatibel dengan profil lama.
export const ACTIVITY_OPTIONS = [
  { value: 'nobar', label: 'Nobar' },
  { value: 'komunitas', label: 'Komunitas' },
  { value: 'gim', label: 'Gim' },
  { value: 'kerja-laptop', label: 'Bekerja dengan laptop' },
  { value: 'acara', label: 'Acara' }
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
    if (!wantedActivities.every((activity) => itemActivities.includes(activity))) return false;
    if (priceRange !== 'semua' && item?.priceRange !== priceRange) return false;
    if (operational === 'buka-24-jam' && item?.openingHours?.is24Hours !== true) return false;
    if (operational === 'buka-sekarang' && isOpenNow(item, now) !== true) return false;
    if (!needle) return true;
    const haystack = normalizeSearchText([
      item?.name, item?.nameNormalized, item?.address, item?.ambience,
      ...(Array.isArray(item?.menuItems) ? item.menuItems : []),
      ...(Array.isArray(item?.specialties) ? item.specialties : []),
      ...(Array.isArray(item?.facilities) ? item.facilities : []),
      ...(Array.isArray(item?.activities) ? item.activities : [])
    ].join(' '));
    return haystack.includes(needle);
  });
}


function coordinateIsValid(point) {
  return Number.isFinite(point?.lat) && Number.isFinite(point?.lng)
    && point.lat >= -90 && point.lat <= 90
    && point.lng >= -180 && point.lng <= 180;
}

export function getDistanceKm(origin, destination) {
  if (!coordinateIsValid(origin) || !coordinateIsValid(destination)) return null;
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(destination.lat - origin.lat);
  const longitudeDelta = radians(destination.lng - origin.lng);
  const originLatitude = radians(origin.lat);
  const destinationLatitude = radians(destination.lat);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
}

function timestampMillis(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && Number.isFinite(value.seconds)) return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function getEventLifecycle(event, now = new Date()) {
  if (event?.eventStatus === 'cancelled') return 'cancelled';
  const start = timestampMillis(event?.eventStartAt);
  if (start === null) return 'invalid';
  const suppliedEnd = timestampMillis(event?.eventEndAt);
  const end = suppliedEnd !== null && suppliedEnd > start ? suppliedEnd : start + 2 * 60 * 60 * 1000;
  const current = now instanceof Date ? now.getTime() : timestampMillis(now);
  if (current === null) return 'invalid';
  if (current < start) return 'upcoming';
  if (current > end) return 'ended';
  return 'ongoing';
}

export function sortDirectoryWarungs(items, category = 'popular', {
  followerCounts = {}, origin = null, events = [], now = new Date()
} = {}) {
  const eventByWarung = new Map();
  for (const event of events || []) {
    if (!event?.warungId || !['ongoing', 'upcoming'].includes(getEventLifecycle(event, now))) continue;
    const current = eventByWarung.get(event.warungId) || [];
    current.push(event);
    eventByWarung.set(event.warungId, current);
  }
  for (const linked of eventByWarung.values()) {
    linked.sort((a, b) => timestampMillis(a.eventStartAt) - timestampMillis(b.eventStartAt));
  }

  const enriched = (items || []).map((item) => ({
    ...item,
    distanceKm: coordinateIsValid(origin) ? getDistanceKm(origin, item.coordinates) : null,
    activeEvent: (eventByWarung.get(item.id) || [])[0] || null
  }));

  if (category === 'events') {
    return enriched.filter((item) => item.activeEvent)
      .sort((a, b) => {
        const aState = getEventLifecycle(a.activeEvent, now);
        const bState = getEventLifecycle(b.activeEvent, now);
        return Number(bState === 'ongoing') - Number(aState === 'ongoing')
          || timestampMillis(a.activeEvent.eventStartAt) - timestampMillis(b.activeEvent.eventStartAt)
          || String(a.name || '').localeCompare(String(b.name || ''), 'id');
      });
  }

  if (category === 'nearby') {
    return enriched.sort((a, b) => {
      if (a.distanceKm === null) return b.distanceKm === null ? String(a.name || '').localeCompare(String(b.name || ''), 'id') : 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm || String(a.name || '').localeCompare(String(b.name || ''), 'id');
    });
  }

  if (category === 'newest') {
    return enriched.sort((a, b) => {
      const aTime = timestampMillis(a.createdAt) ?? -Infinity;
      const bTime = timestampMillis(b.createdAt) ?? -Infinity;
      return bTime - aTime || String(a.name || '').localeCompare(String(b.name || ''), 'id');
    });
  }

  return enriched.sort((a, b) => {
    const countDifference = (Number(followerCounts[b.id]) || 0) - (Number(followerCounts[a.id]) || 0);
    return countDifference || String(a.name || '').localeCompare(String(b.name || ''), 'id');
  });
}
