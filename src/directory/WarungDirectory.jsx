import { useEffect, useReducer, useState } from 'react';
import { addDoc, collection, doc, getCountFromServer, getDoc, getDocs, limit, onSnapshot, query, serverTimestamp, startAfter, where } from 'firebase/firestore';
import { photoUploadErrorMessage, uploadWarkopMedia } from '../media/uploadWarkopMedia.js';
import { MAX_WARUNG_PHOTOS, validateImageFiles } from '../media/imagePolicy.js';
import { MapPin, Store, ShieldCheck, ArrowUpRight, Clock, LocateFixed } from 'lucide-react';
import { ACTIVITY_OPTIONS, collectFacilities, collectActivities, calculateDistanceKm, filterWarungs, isCurrentOrUpcomingEvent, isOpenNow, sortWarungsForDiscovery } from './directoryFilters.js';
import LeafletLocationPicker from './LeafletLocationPicker.jsx';
import OfficialRegionPicker from './OfficialRegionPicker.jsx';
import { buildRegionIdentity } from './regionIdentity.js';
import { buildGoogleMapsDirectionsUrl } from './mapLocation.js';
import { filterWarungsByLocation } from '../home/locationDiscovery.js';
import WarungDiscoveryMap from './WarungDiscoveryMap.jsx';
import WarungDiscoveryPage from './WarungDiscoveryPage.jsx';
import { createInitialDiscoveryState, discoveryReducer } from './discoveryState.js';

function normalizeWhatsAppNumber(value) {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
}

class WarungFormValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WarungFormValidationError';
  }
}

export default function WarungDirectory({ mode, user, db, location = { mode: 'all' }, mapViewRequested = false, onMapViewRequestHandled, onRequestAuth, onNotice, onOpenWarung, onRegister }) {
  const [warungs, setWarungs] = useState([]);
  const [status, setStatus] = useState(db ? 'loading' : 'error');
  const [directoryRetry, setDirectoryRetry] = useState(0);
  const [lastDocument, setLastDocument] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchingAll, setSearchingAll] = useState(false);
  const [moreError, setMoreError] = useState('');
  const [discoveryState, dispatchDiscovery] = useReducer(discoveryReducer, location, createInitialDiscoveryState);
  const { query: searchTerm, category: discoveryCategory, facilities: facilityFilter, activities: activityFilter, operational: operationalFilter, viewMode } = discoveryState;
  const setSearchTerm = (value) => dispatchDiscovery({ type: 'SET_QUERY', value });
  const setOperationalFilter = (value) => dispatchDiscovery({ type: 'SET_OPERATIONAL', value });
  const setDiscoveryCategory = (value) => dispatchDiscovery({ type: 'SET_CATEGORY', value });
  const [followerCounts] = useState({});
  const [popularStatus] = useState('idle');
  const [discoveryEvents, setDiscoveryEvents] = useState([]);
  const [eventsStatus, setEventsStatus] = useState('idle');
  const [visitorLocation, setVisitorLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState('idle');
  const mapViewOpen = viewMode === 'map';
  const setMapViewOpen = (value) => dispatchDiscovery({ type: 'SET_VIEW_MODE', value: typeof value === 'function' ? (value(mapViewOpen) ? 'map' : 'list') : (value ? 'map' : 'list') });
  const [now, setNow] = useState(() => new Date());
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [regionSelection, setRegionSelection] = useState(null);
  const provinceName = regionSelection?.provinceName || '';
  const regencyName = regionSelection?.regencyName || '';
  const districtName = regionSelection?.districtName || '';
  const villageName = regionSelection?.villageName || '';
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [facilities, setFacilities] = useState('');
  const [selectedActivities, setSelectedActivities] = useState([]);
  const [menuItems, setMenuItems] = useState('');
  const [specialties, setSpecialties] = useState('');
  const [ambience, setAmbience] = useState('');
  const [hours, setHours] = useState('');
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [incompleteWarungId, setIncompleteWarungId] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [registrationStep, setRegistrationStep] = useState(1);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (mode === 'directory' && mapViewRequested) {
      setMapViewOpen(true);
      onMapViewRequestHandled?.();
    }
  }, [mode, mapViewRequested, onMapViewRequestHandled]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (mode !== 'directory' || !db) return undefined;
    setStatus('loading');
    setWarungs([]);
    setLastDocument(null);
    setHasMore(false);
    setMoreError('');
    const verifiedQuery = query(
      collection(db, 'warungs'),
      where('verificationStatus', '==', 'verified'),
      limit(30)
    );
    return onSnapshot(verifiedQuery, (snapshot) => {
      setWarungs(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) =>
        String(a.nameNormalized || a.name || '').localeCompare(String(b.nameNormalized || b.name || ''), 'id')
        || a.id.localeCompare(b.id)
      ));
      setLastDocument(snapshot.docs.at(-1) || null);
      setHasMore(snapshot.docs.length === 30);
      setStatus('ready');
    }, () => setStatus('error'));
  }, [mode, db, directoryRetry]);

  const hasActiveFilter = Boolean(searchTerm.trim()) || facilityFilter.length > 0 || activityFilter.length > 0 || operationalFilter !== 'semua';

  // Ambil acara komunitas hanya ketika kategori acara dibuka; batasi bacaan agar ringan.
  useEffect(() => {
    if (mode !== 'directory' || discoveryCategory !== 'events' || !db) return undefined;
    let cancelled = false;
    setEventsStatus('loading');
    const unsubscribe = onSnapshot(query(collection(db, 'posts'), where('topic', '==', 'Info & Acara'), limit(200)), (snapshot) => {
      if (cancelled) return;
      const nowValue = new Date();
      setDiscoveryEvents(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
        .filter((event) => event.warungId && isCurrentOrUpcomingEvent(event, nowValue)));
      setEventsStatus('ready');
    }, () => { if (!cancelled) setEventsStatus('error'); });
    return () => { cancelled = true; unsubscribe(); };
  }, [mode, db, discoveryCategory]);

  function selectDiscoveryCategory(category) {
    setDiscoveryCategory(category);
    if (category !== 'nearby' || visitorLocation || locationStatus === 'loading') return;
    if (!navigator.geolocation) {
      setLocationStatus('unsupported');
      return;
    }
    setLocationStatus('loading');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setVisitorLocation({ lat: coords.latitude, lng: coords.longitude });
      setLocationStatus('ready');
    }, (error) => {
      setLocationStatus(error.code === 1 ? 'denied' : 'error');
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  }

  function handleNextRegistrationStep() {
    setFormError('');
    if (registrationStep === 1) {
      if (name.trim().length < 2 || name.trim().length > 100) return setFormError('Nama warkop harus 2–100 karakter.');
      if (!regionSelection?.villageCode) return setFormError('Pilih provinsi, kabupaten/kota, kecamatan, dan desa/kelurahan dari daftar resmi.');
      if (address.trim().length < 5 || address.trim().length > 300) return setFormError('Alamat harus 5–300 karakter.');
      const latitude = Number(lat);
      const longitude = Number(lng);
      if (!lat.trim() || !lng.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return setFormError('Tentukan lokasi warkop dengan GPS atau isi koordinat yang valid.');
      }
      if (!/^628[0-9]{7,11}$/.test(normalizeWhatsAppNumber(whatsapp))) {
        return setFormError('Nomor WhatsApp wajib diisi dengan nomor Indonesia yang aktif. Contoh: 081234567890.');
      }
    }
    if (registrationStep === 2) {
      const specialtyList = specialties.split(',').map((item) => item.trim()).filter(Boolean);
      if (!specialtyList.length) return setFormError('Tambahkan minimal satu menu spesial warkop.');
      if (specialtyList.length > 15 || specialtyList.some((item) => item.length > 60)) return setFormError('Maksimal 15 menu spesial, setiap nama maksimal 60 karakter.');
    }
    setRegistrationStep((step) => Math.min(3, step + 1));
  }

  function handlePreviousRegistrationStep() {
    setFormError('');
    setRegistrationStep((step) => Math.max(1, step - 1));
  }

  function handleUseCurrentLocation() {
    if (!navigator.geolocation) {
      setFormError('Browser ini tidak mendukung GPS. Silakan isi koordinat secara manual.');
      return;
    }
    setLocating(true);
    setFormError('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLat(coords.latitude.toFixed(6));
        setLng(coords.longitude.toFixed(6));
        setLocating(false);
      },
      (error) => {
        const message = error.code === 1
          ? 'Izin lokasi ditolak. Izinkan akses lokasi di browser atau isi koordinat secara manual.'
          : error.code === 2
            ? 'Lokasi belum dapat ditemukan. Coba aktifkan GPS lalu ulangi.'
            : 'Permintaan lokasi terlalu lama. Coba lagi atau isi koordinat secara manual.';
        setFormError(message);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }

  async function handleRegister(event) {
    event.preventDefault();
    if (!user) {
      onRequestAuth();
      onNotice('Masuk atau buat akun terlebih dahulu untuk mendaftarkan warkop.');
      return;
    }
    if (!db) return setFormError('Firebase belum dikonfigurasi.');
    const photoError = validateImageFiles(selectedPhotos, { maxFiles: MAX_WARUNG_PHOTOS });
    if (photoError) return setFormError(photoError);
    if (!/^628[0-9]{7,11}$/.test(normalizeWhatsAppNumber(whatsapp))) return setFormError('Nomor WhatsApp wajib diisi dengan nomor Indonesia yang aktif. Contoh: 081234567890.');
    const specialtyList = specialties.split(',').map((item) => item.trim()).filter(Boolean);
    if (!specialtyList.length) return setFormError('Tambahkan minimal satu menu spesial warkop.');
    if (specialtyList.length > 15 || specialtyList.some((item) => item.length > 60)) return setFormError('Maksimal 15 menu spesial, setiap nama maksimal 60 karakter.');
    if (!selectedPhotos.length) return setFormError('Pilih minimal satu foto utama warkop sebelum mengirim pendaftaran.');
    setSaving(true);
    setFormError('');
    let registrationId = incompleteWarungId;
    try {
      let warungId = incompleteWarungId;
      let uploadedCount = 0;
      if (!warungId) {
        const cleanName = name.trim();
        const cleanAddress = address.trim();
        const cleanWhatsApp = normalizeWhatsAppNumber(whatsapp);
        const region = buildRegionIdentity(regionSelection);
        const latitude = Number(lat);
        const longitude = Number(lng);
        if (cleanName.length < 2 || cleanName.length > 100) throw new WarungFormValidationError('Nama warkop harus 2–100 karakter.');
        if (!region.villageCode) throw new WarungFormValidationError('Lengkapi pilihan wilayah resmi sampai desa/kelurahan.');
        if (cleanAddress.length < 5 || cleanAddress.length > 300) throw new WarungFormValidationError('Alamat harus 5–300 karakter.');
        if (!lat.trim() || !lng.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) throw new WarungFormValidationError('Masukkan koordinat lintang atau bujur yang valid.');
        const facilityList = [...new Set(facilities.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))];
        if (facilityList.length > 20) throw new WarungFormValidationError('Maksimal 20 fasilitas.');
        const warungRef = await addDoc(collection(db, 'warungs'), {
          name: cleanName, nameNormalized: cleanName.toLowerCase(), ownerUid: user.uid,
          whatsapp: cleanWhatsApp, registrationPolicyVersion: 2,
          coordinates: { lat: latitude, lng: longitude }, address: cleanAddress,
          ...region, facilities: facilityList, activities: selectedActivities,
          menuItems: menuItems.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 30),
          specialties: specialtyList,
          ambience: ambience.trim().slice(0, 240), priceRange: 'belum-diisi',
          openingHours: hours.trim() ? { keterangan: hours.trim().slice(0, 120) } : {},
          photos: [], verificationStatus: 'pending',
          createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
        warungId = warungRef.id;
        registrationId = warungId;
        setIncompleteWarungId(warungId);
      } else {
        const existing = await getDoc(doc(db, 'warungs', warungId));
        if (!existing.exists() || existing.data().ownerUid !== user.uid) throw new Error('Pendaftaran tidak dapat dilanjutkan.');
        uploadedCount = Array.isArray(existing.data().photos) ? existing.data().photos.length : 0;
      }
      for (let index = uploadedCount; index < selectedPhotos.length; index++) {
        await uploadWarkopMedia({ user, mediaType: 'warung', resourceId: warungId, slot: index, file: selectedPhotos[index] });
      }
      setIncompleteWarungId('');
      setSelectedPhotos([]);
      setName(''); setAddress(''); setWhatsapp(''); setRegionSelection(null); setLat(''); setLng(''); setFacilities('');
      setSelectedActivities([]);
      setMenuItems(''); setSpecialties(''); setAmbience('');
      setHours('');
      setRegistrationStep(1);
      onNotice(selectedPhotos.length ? 'Pendaftaran dan foto warkop berhasil dikirim. Menunggu verifikasi admin.' : 'Pendaftaran terkirim. Warkop menunggu verifikasi admin.');
    } catch (error) {
      const message = error instanceof WarungFormValidationError ? error.message : photoUploadErrorMessage(error);
      setFormError(registrationId
        ? `Pendaftaran ${registrationId} sudah tersimpan, tetapi foto belum berhasil diunggah. ${message} Tekan "Lanjutkan unggah foto" untuk mencoba lagi.`
        : message || 'Pendaftaran belum berhasil. Periksa koneksi lalu coba lagi.');
    } finally {
      setSaving(false);
    }
  }

  async function handleLoadMore() {
    if (!db || !lastDocument || loadingMore || searchingAll || !hasMore) return;
    setLoadingMore(true);
    setMoreError('');
    try {
      const nextQuery = query(
        collection(db, 'warungs'),
        where('verificationStatus', '==', 'verified'),
        startAfter(lastDocument),
        limit(30)
      );
      const snapshot = await getDocs(nextQuery);
      const nextRows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      setWarungs((current) => {
        const merged = new Map(current.map((item) => [item.id, item]));
        nextRows.forEach((item) => { if (!merged.has(item.id)) merged.set(item.id, item); });
        return [...merged.values()].sort((a, b) =>
          String(a.nameNormalized || a.name || '').localeCompare(String(b.nameNormalized || b.name || ''), 'id')
          || a.id.localeCompare(b.id)
        );
      });
      setLastDocument(snapshot.docs.at(-1) || lastDocument);
      setHasMore(snapshot.docs.length === 30);
    } catch {
      setMoreError('Halaman berikutnya belum dapat dimuat. Periksa koneksi lalu coba lagi.');
    } finally {
      setLoadingMore(false);
    }
  }

  if (mode === 'register') {
    return <section className="content-section explore-section">
      <span className="eyebrow">DAFTAR GRATIS</span>
      <h2>Ajukan warkop Anda.</h2>
      <p>Isi data yang benar. Pendaftaran berstatus menunggu sampai admin memeriksanya; warkop baru tampil di direktori publik setelah disetujui.</p>
      {!user && <div className="directory-notice"><ShieldCheck size={18}/><span>Anda perlu masuk ke akun untuk mengirim pendaftaran.</span><button className="button button-dark" onClick={onRequestAuth}>Masuk / Daftar akun</button></div>}
      <div className="warung-registration-progress" aria-label={"Langkah " + registrationStep + " dari 3"}>
        <div className="warung-registration-progress-copy"><strong>Langkah {registrationStep} dari 3</strong><span>{['Identitas & lokasi', 'Menu & fasilitas', 'Foto & konfirmasi'][registrationStep - 1]}</span></div>
        <div className="warung-registration-progress-track"><span style={{ width: (registrationStep / 3) * 100 + '%' }} /></div>
        <div className="warung-registration-step-labels"><span className={registrationStep >= 1 ? 'active' : ''}>Identitas</span><span className={registrationStep >= 2 ? 'active' : ''}>Detail</span><span className={registrationStep >= 3 ? 'active' : ''}>Foto</span></div>
      </div>
      <form className="warung-form" onSubmit={handleRegister}>
        {registrationStep === 1 && <>
          <label>Nama warkop<input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required placeholder="Contoh: Warkop Pojok"/></label>
          <OfficialRegionPicker value={regionSelection} onChange={setRegionSelection}/>
          <label>Alamat lengkap<textarea value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} required rows={3} placeholder="Nama jalan, desa/kelurahan, kecamatan"/></label>
          <label>Nomor WhatsApp aktif<input type="tel" inputMode="tel" autoComplete="tel" aria-label="Nomor WhatsApp aktif" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} maxLength={20} required placeholder="081234567890"/><span className="form-hint">Nomor ini akan ditampilkan sebagai kontak bisnis setelah warkop terverifikasi.</span></label>
          <div className="warung-location-selection">
            <strong>Tentukan titik lokasi warkop</strong>
            <p>Pilih langsung pada peta, geser pin ke posisi yang tepat, atau gunakan GPS perangkat. Koordinat akan terisi otomatis.</p>
          </div>
          <LeafletLocationPicker latitude={lat} longitude={lng} onChange={(nextLat, nextLng) => { setLat(nextLat); setLng(nextLng); }} />
          <button className="button button-quiet warung-location-button" type="button" onClick={handleUseCurrentLocation} disabled={locating}><LocateFixed size={17}/>{locating ? 'Mencari lokasi…' : 'Gunakan Lokasi Saya'}</button>
          <p className="warung-location-status" role="status" aria-live="polite">{lat && lng ? 'Titik lokasi sudah dipilih. Pastikan pin berada tepat di lokasi warkop.' : 'Belum ada titik lokasi. Pilih titik pada peta atau gunakan GPS.'}</p>
        </>}
        {registrationStep === 2 && <>
          <label>Menu utama, pisahkan dengan koma<input value={menuItems} onChange={(e) => setMenuItems(e.target.value)} maxLength={600} placeholder="Kopi, teh, mi instan, nasi goreng"/></label>
          <label>Menu spesial wajib, pisahkan dengan koma<input aria-label="Menu spesial, pisahkan dengan koma" value={specialties} onChange={(e) => setSpecialties(e.target.value)} maxLength={900} placeholder="Kopi racikan, mi nyemek, pisang goreng"/><span className="form-hint">Isi minimal satu menu andalan. Maksimal 15 nama menu.</span></label>
          <label>Fasilitas, pisahkan dengan koma<input value={facilities} onChange={(e) => setFacilities(e.target.value)} placeholder="Wi-Fi, parkir, toilet"/></label>
          <fieldset className="warung-activity-options"><legend>Aktivitas warkop</legend><p className="form-hint">Pilih kegiatan yang memang tersedia di warkop Anda.</p><div className="facility-filter-list">{ACTIVITY_OPTIONS.map((activity) => <label className="facility-chip" key={activity.value}><input type="checkbox" checked={selectedActivities.includes(activity.value)} onChange={() => setSelectedActivities((current) => current.includes(activity.value) ? current.filter((value) => value !== activity.value) : [...current, activity.value])}/>{activity.label}</label>)}</div></fieldset>
          <label>Suasana warkop<textarea value={ambience} onChange={(e) => setAmbience(e.target.value)} maxLength={240} rows={2} placeholder="Santai, cocok untuk ngobrol atau kerja ringan"/></label>
          <label>Jam buka (opsional)<input value={hours} onChange={(e) => setHours(e.target.value)} maxLength={120} placeholder="Contoh: Setiap hari, 08.00–23.00"/></label>
        </>}
        {registrationStep === 3 && <>
          <p className="form-hint">Periksa kembali data warkop. Satu foto utama wajib diunggah; hingga empat foto tambahan bersifat opsional.</p>
          <div className="warung-registration-summary"><strong>{name}</strong><span>{[villageName, districtName, regencyName, provinceName].filter(Boolean).join(', ')}</span><span>{address}</span><span>Koordinat: {lat}, {lng}</span>{menuItems.trim() && <span>Menu: {menuItems}</span>}{specialties.trim() && <span>Menu spesial: {specialties}</span>}{selectedActivities.length > 0 && <span>Aktivitas: {selectedActivities.map((value) => ACTIVITY_OPTIONS.find((item) => item.value === value)?.label || value).join(', ')}</span>}</div>
          <label>Foto utama warkop dan foto tambahan (foto pertama menjadi sampul; maksimal 5, JPG/PNG/WebP, 2 MiB per foto)<input aria-label="Foto utama warkop dan foto tambahan" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={Boolean(incompleteWarungId)} onChange={(event) => { const files = Array.from(event.target.files || []); const error = validateImageFiles(files); if (error) { setFormError(error); setSelectedPhotos([]); event.target.value = ''; return; } setFormError(''); setSelectedPhotos(files); }} /></label>
          {selectedPhotos.length > 0 && <p className="form-hint">Foto utama: {selectedPhotos[0].name}. {selectedPhotos.length > 1 ? `${selectedPhotos.length - 1} foto tambahan dipilih.` : 'Belum ada foto tambahan.'} {incompleteWarungId ? 'Pilihan foto dikunci sampai unggahan selesai.' : ''}</p>}
        </>}
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <div className="warung-form-step-actions">
          {registrationStep > 1 && <button className="button button-quiet" type="button" onClick={handlePreviousRegistrationStep} disabled={saving}>Kembali</button>}
          {registrationStep < 3 ? <button className="button button-dark" type="button" onClick={handleNextRegistrationStep}>Lanjut</button> : <button className="button button-dark" type="submit" disabled={saving}>{saving ? 'Memproses…' : incompleteWarungId ? 'Lanjutkan unggah foto' : 'Kirim pendaftaran'}</button>}
        </div>
      </form>
    </section>;
  }

  const locationScopedWarungs = filterWarungsByLocation(warungs, location);
  const effectiveVisitorLocation = location?.mode === 'nearby' && location.coordinates ? location.coordinates : visitorLocation;
  const facilityOptions = collectFacilities(locationScopedWarungs);
  const distances = effectiveVisitorLocation ? Object.fromEntries(locationScopedWarungs.map((item) => [
    item.id, calculateDistanceKm(effectiveVisitorLocation, item.coordinates)
  ]).filter(([, distance]) => Number.isFinite(distance))) : {};
  const orderedEvents = [...discoveryEvents].sort((a, b) =>
    new Date(a.eventStartAt || a.eventDate).getTime() - new Date(b.eventStartAt || b.eventDate).getTime()
  );
  const eventByWarung = new Map();
  orderedEvents.forEach((event) => { if (!eventByWarung.has(event.warungId)) eventByWarung.set(event.warungId, event); });
  const eventWarungIds = [...eventByWarung.keys()];
  const eventStarts = Object.fromEntries([...eventByWarung.entries()].map(([id, event]) => [id, event.eventStartAt || event.eventDate]));
  const categoryWarungs = discoveryCategory === 'nearby' && !effectiveVisitorLocation
    ? locationScopedWarungs
    : sortWarungsForDiscovery(locationScopedWarungs, discoveryCategory, { followerCounts, distances, eventWarungIds, eventStarts, now });
  const visibleWarungs = filterWarungs(categoryWarungs, {
    search: searchTerm, facilities: facilityFilter, activities: activityFilter,
    operational: operationalFilter, priceRange: 'semua', now
  });
  function toggleFacility(key) {
    dispatchDiscovery({ type: 'TOGGLE_FACILITY', value: key });
  }
  function toggleActivity(key) {
    dispatchDiscovery({ type: 'TOGGLE_ACTIVITY', value: key });
  }
  return <WarungDiscoveryPage
    location={location}
    category={discoveryCategory}
    onCategoryChange={setDiscoveryCategory}
    searchTerm={searchTerm}
    onSearchChange={setSearchTerm}
    facilityOptions={facilityOptions}
    activityOptions={collectActivities(locationScopedWarungs)}
    facilityFilter={facilityFilter}
    activityFilter={activityFilter}
    onToggleFacility={toggleFacility}
    onToggleActivity={toggleActivity}
    operationalFilter={operationalFilter}
    onOperationalChange={setOperationalFilter}
    hasActiveFilter={hasActiveFilter}
    onResetFilters={() => dispatchDiscovery({ type: 'RESET_FILTERS' })}
    status={status}
    searchingAll={searchingAll}
    visibleWarungs={visibleWarungs}
    locationScopedWarungs={locationScopedWarungs}
    locationStatus={locationStatus}
    effectiveVisitorLocation={effectiveVisitorLocation}
    eventsStatus={eventsStatus}
    discoveryEvents={discoveryEvents}
    popularStatus={popularStatus}
    followerCounts={followerCounts}
    distances={distances}
    eventByWarung={eventByWarung}
    now={now}
    mapViewOpen={mapViewOpen}
    onToggleMap={() => setMapViewOpen((current) => !current)}
    onOpenWarung={onOpenWarung}
    hasMore={hasMore}
    loadingMore={loadingMore}
    onLoadMore={handleLoadMore}
    moreError={moreError}
    onRegister={onRegister}
    onRetry={() => setDirectoryRetry((attempt) => attempt + 1)}
  />;
}