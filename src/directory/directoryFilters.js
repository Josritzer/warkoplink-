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


export function calculateDistanceKm(origin, destination) {
  const lat1 = Number(origin?.lat);
  const lng1 = Number(origin?.lng);
  const lat2 = Number(destination?.lat);
  const lng2 = Number(destination?.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)
    || Math.abs(lat1) > 90 || Math.abs(lat2) > 90
    || Math.abs(lng1) > 180 || Math.abs(lng2) > 180) return null;
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
  if (category === 'newest') {
    return rows.sort((a, b) =>
      timestampMillis(b.createdAt) - timestampMillis(a.createdAt) || compareName(a, b)
    );
  }
  return rows.sort(compareName);
}
