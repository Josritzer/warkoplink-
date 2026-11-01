import { useEffect, useState } from 'react';
import { addDoc, collection, doc, getCountFromServer, getDoc, getDocs, limit, onSnapshot, query, serverTimestamp, startAfter, where } from 'firebase/firestore';
import { photoUploadErrorMessage, uploadWarkopMedia } from '../media/uploadWarkopMedia.js';
import { MAX_WARUNG_PHOTOS, validateImageFiles } from '../media/imagePolicy.js';
import { MapPin, Store, ShieldCheck, ArrowUpRight, Clock, LocateFixed } from 'lucide-react';
import { ACTIVITY_OPTIONS, collectFacilities, calculateDistanceKm, filterWarungs, isCurrentOrUpcomingEvent, isOpenNow, sortWarungsForDiscovery } from './directoryFilters.js';
import LeafletLocationPicker from './LeafletLocationPicker.jsx';

class WarungFormValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WarungFormValidationError';
  }
}

export default function WarungDirectory({ mode, user, db, onRequestAuth, onNotice, onOpenWarung, onRegister }) {
  const [warungs, setWarungs] = useState([]);
  const [status, setStatus] = useState(db ? 'loading' : 'error');
  const [directoryRetry, setDirectoryRetry] = useState(0);
  const [lastDocument, setLastDocument] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchingAll, setSearchingAll] = useState(false);
  const [moreError, setMoreError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [facilityFilter, setFacilityFilter] = useState([]);
  const [activityFilter, setActivityFilter] = useState([]);
  const [operationalFilter, setOperationalFilter] = useState('semua');
  const priceFilter = 'semua';
  const [discoveryCategory, setDiscoveryCategory] = useState('all');
  const [followerCounts, setFollowerCounts] = useState({});
  const [popularStatus, setPopularStatus] = useState('idle');
  const [discoveryEvents, setDiscoveryEvents] = useState([]);
  const [eventsStatus, setEventsStatus] = useState('idle');
  const [visitorLocation, setVisitorLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState('idle');
  const [now, setNow] = useState(() => new Date());
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [facilities, setFacilities] = useState('');
  const [menuItems, setMenuItems] = useState('');
  const [specialties, setSpecialties] = useState('');
  const [ambience, setAmbience] = useState('');
  const [priceRange, setPriceRange] = useState('belum-diisi');
  const [hours, setHours] = useState('');
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [incompleteWarungId, setIncompleteWarungId] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [registrationStep, setRegistrationStep] = useState(1);
  const [locating, setLocating] = useState(false);

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

  const hasActiveFilter = Boolean(searchTerm.trim()) || facilityFilter.length > 0 || activityFilter.length > 0 || operationalFilter !== 'semua' || priceFilter !== 'semua';
  const shouldLoadAllWarungs = hasActiveFilter || discoveryCategory !== 'all';

  // Ketika pengguna mencari atau memfilter, perluas seluruh halaman verified secara otomatis.
  // Tanpa ini, hasil di halaman ke-2 dan seterusnya tidak pernah ikut diperiksa.
  useEffect(() => {
    if (mode !== 'directory' || !db || status !== 'ready' || !shouldLoadAllWarungs || !hasMore || !lastDocument) return undefined;
    let cancelled = false;
    async function loadAllMatchingPages() {
      setSearchingAll(true);
      setMoreError('');
      let cursor = lastDocument;
      let hasNextPage = true;
      const additionalRows = [];
      try {
        while (hasNextPage && !cancelled) {
          const snapshot = await getDocs(query(
            collection(db, 'warungs'),
            where('verificationStatus', '==', 'verified'),
            startAfter(cursor),
            limit(30)
          ));
          const pageRows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
          additionalRows.push(...pageRows);
          if (snapshot.docs.length) cursor = snapshot.docs.at(-1);
          hasNextPage = snapshot.docs.length === 30;
        }
        if (!cancelled) {
          setWarungs((current) => {
            const merged = new Map(current.map((item) => [item.id, item]));
            additionalRows.forEach((item) => { if (!merged.has(item.id)) merged.set(item.id, item); });
            return [...merged.values()].sort((a, b) =>
              String(a.nameNormalized || a.name || '').localeCompare(String(b.nameNormalized || b.name || ''), 'id')
              || a.id.localeCompare(b.id)
            );
          });
          setLastDocument(cursor);
          setHasMore(false);
        }
      } catch {
        if (!cancelled) setMoreError('Pencarian belum mencakup seluruh direktori karena halaman berikutnya gagal dimuat. Coba lagi.');
      } finally {
        if (!cancelled) setSearchingAll(false);
      }
    }
    loadAllMatchingPages();
    return () => { cancelled = true; };
  }, [mode, db, status, shouldLoadAllWarungs, hasMore, lastDocument, directoryRetry]);


  // Popularitas memakai jumlah follower profil warkop, bukan reaksi pada postingan.
  useEffect(() => {
    if (mode !== 'directory' || discoveryCategory !== 'popular' || status !== 'ready' || searchingAll || hasMore) return undefined;
    let cancelled = false;
    setPopularStatus('loading');
    let cursor = 0;
    const entries = [];
    async function readFollowerCounts() {
      const workers = Array.from({ length: Math.min(8, warungs.length) }, async () => {
        while (!cancelled && cursor < warungs.length) {
          const item = warungs[cursor++];
          try {
            const result = await getCountFromServer(collection(db, 'warungs', item.id, 'followers'));
            entries.push([item.id, result.data().count]);
          } catch {
            entries.push([item.id, null]);
          }
        }
      });
      await Promise.all(workers);
      return entries;
    }
    readFollowerCounts().then((entries) => {
      if (cancelled) return;
      setFollowerCounts(Object.fromEntries(entries.filter(([, count]) => Number.isFinite(count))));
      setPopularStatus(entries.some(([, count]) => count === null) ? 'error' : 'ready');
    });
    return () => { cancelled = true; };
  }, [mode, db, discoveryCategory, status, searchingAll, hasMore, warungs]);

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
      if (address.trim().length < 5 || address.trim().length > 300) return setFormError('Alamat harus 5–300 karakter.');
      const latitude = Number(lat);
      const longitude = Number(lng);
      if (!lat.trim() || !lng.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return setFormError('Tentukan lokasi warkop dengan GPS atau isi koordinat yang valid.');
      }
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
    setSaving(true);
    setFormError('');
    let registrationId = incompleteWarungId;
    try {
      let warungId = incompleteWarungId;
      let uploadedCount = 0;
      if (!warungId) {
        const cleanName = name.trim();
        const cleanAddress = address.trim();
        const latitude = Number(lat);
        const longitude = Number(lng);
        if (cleanName.length < 2 || cleanName.length > 100) throw new WarungFormValidationError('Nama warkop harus 2–100 karakter.');
        if (cleanAddress.length < 5 || cleanAddress.length > 300) throw new WarungFormValidationError('Alamat harus 5–300 karakter.');
        if (!lat.trim() || !lng.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) throw new WarungFormValidationError('Masukkan koordinat lintang atau bujur yang valid.');
        const facilityList = [...new Set(facilities.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))];
        if (facilityList.length > 20) throw new WarungFormValidationError('Maksimal 20 fasilitas.');
        const warungRef = await addDoc(collection(db, 'warungs'), {
          name: cleanName, nameNormalized: cleanName.toLowerCase(), ownerUid: user.uid,
          coordinates: { lat: latitude, lng: longitude }, address: cleanAddress,
          regionCode: 'lamongan-kab', facilities: facilityList, activities: [],
          menuItems: menuItems.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 30),
          specialties: specialties.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 15),
          ambience: ambience.trim().slice(0, 240), priceRange,
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
      setName(''); setAddress(''); setLat(''); setLng(''); setFacilities('');
      setMenuItems(''); setSpecialties(''); setAmbience('');
      setPriceRange('belum-diisi'); setHours('');
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
          <label>Alamat lengkap di Kabupaten Lamongan<textarea value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} required rows={3} placeholder="Nama jalan, desa, kecamatan"/></label>
          <div className="coordinate-fields">
            <label>Lintang (latitude)<input type="text" inputMode="decimal" autoComplete="off" value={lat} onChange={(e) => setLat(e.target.value)} required placeholder="Contoh: -7.0001" aria-describedby="latitude-help"/></label>
            <label>Bujur (longitude)<input type="text" inputMode="decimal" autoComplete="off" value={lng} onChange={(e) => setLng(e.target.value)} required placeholder="Contoh: 112.2810" aria-describedby="longitude-help"/></label>
          </div>
          <LeafletLocationPicker latitude={lat} longitude={lng} onChange={(nextLat, nextLng) => { setLat(nextLat); setLng(nextLng); }} />
          <button className="button button-quiet warung-location-button" type="button" onClick={handleUseCurrentLocation} disabled={locating}><LocateFixed size={17}/>{locating ? 'Mencari lokasi…' : 'Gunakan Lokasi Saya'}</button>
          <div className="coordinate-help"><small id="latitude-help">Lintang: angka utara/selatan, untuk Lamongan biasanya diawali -7.</small><small id="longitude-help">Bujur: angka timur/barat, untuk Lamongan biasanya diawali 112.</small><small>GPS mengisi koordinat perangkat. Periksa dan sesuaikan titik agar tepat di lokasi warkop.</small></div>
        </>}
        {registrationStep === 2 && <>
          <label>Menu utama, pisahkan dengan koma<input value={menuItems} onChange={(e) => setMenuItems(e.target.value)} maxLength={600} placeholder="Kopi, teh, mi instan, nasi goreng"/></label>
          <label>Menu spesial, pisahkan dengan koma<input value={specialties} onChange={(e) => setSpecialties(e.target.value)} maxLength={400} placeholder="Kopi racikan, mi nyemek, pisang goreng"/></label>
          <label>Fasilitas, pisahkan dengan koma<input value={facilities} onChange={(e) => setFacilities(e.target.value)} placeholder="Wi-Fi, parkir, toilet"/></label>
          <label>Suasana warkop<textarea value={ambience} onChange={(e) => setAmbience(e.target.value)} maxLength={240} rows={2} placeholder="Santai, cocok untuk ngobrol atau kerja ringan"/></label>
          <label>Kisaran harga (opsional)<select value={priceRange} onChange={(e) => setPriceRange(e.target.value)}><option value="belum-diisi">Tidak ingin mencantumkan</option><option value="hemat">Hemat</option><option value="sedang">Sedang</option><option value="premium">Premium</option></select></label>
          <label>Jam buka (opsional)<input value={hours} onChange={(e) => setHours(e.target.value)} maxLength={120} placeholder="Contoh: Setiap hari, 08.00–23.00"/></label>
        </>}
        {registrationStep === 3 && <>
          <p className="form-hint">Periksa kembali data warkop sebelum dikirim. Foto dapat ditambahkan sekarang atau menyusul.</p>
          <div className="warung-registration-summary"><strong>{name}</strong><span>{address}</span><span>Koordinat: {lat}, {lng}</span>{menuItems.trim() && <span>Menu: {menuItems}</span>}{specialties.trim() && <span>Menu spesial: {specialties}</span>}</div>
          <label>Foto warkop (maksimal 5, JPG/PNG/WebP, 2 MiB per foto)<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={Boolean(incompleteWarungId)} onChange={(event) => { const files = Array.from(event.target.files || []); const error = validateImageFiles(files); if (error) { setFormError(error); setSelectedPhotos([]); event.target.value = ''; return; } setFormError(''); setSelectedPhotos(files); }} /></label>
          {selectedPhotos.length > 0 && <p className="form-hint">{selectedPhotos.length} foto dipilih. {incompleteWarungId ? 'Pilihan foto dikunci sampai unggahan selesai.' : ''}</p>}
        </>}
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <div className="warung-form-step-actions">
          {registrationStep > 1 && <button className="button button-quiet" type="button" onClick={handlePreviousRegistrationStep} disabled={saving}>Kembali</button>}
          {registrationStep < 3 ? <button className="button button-dark" type="button" onClick={handleNextRegistrationStep}>Lanjut</button> : <button className="button button-dark" type="submit" disabled={saving}>{saving ? 'Memproses…' : incompleteWarungId ? 'Lanjutkan unggah foto' : 'Kirim pendaftaran'}</button>}
        </div>
      </form>
    </section>;
  }

  const facilityOptions = collectFacilities(warungs);
  const distances = visitorLocation ? Object.fromEntries(warungs.map((item) => [
    item.id, calculateDistanceKm(visitorLocation, item.coordinates)
  ]).filter(([, distance]) => Number.isFinite(distance))) : {};
  const orderedEvents = [...discoveryEvents].sort((a, b) =>
    new Date(a.eventStartAt || a.eventDate).getTime() - new Date(b.eventStartAt || b.eventDate).getTime()
  );
  const eventByWarung = new Map();
  orderedEvents.forEach((event) => { if (!eventByWarung.has(event.warungId)) eventByWarung.set(event.warungId, event); });
  const eventWarungIds = [...eventByWarung.keys()];
  const eventStarts = Object.fromEntries([...eventByWarung.entries()].map(([id, event]) => [id, event.eventStartAt || event.eventDate]));
  const categoryWarungs = discoveryCategory === 'nearby' && !visitorLocation
    ? warungs
    : sortWarungsForDiscovery(warungs, discoveryCategory, { followerCounts, distances, eventWarungIds, eventStarts, now });
  const visibleWarungs = filterWarungs(categoryWarungs, {
    search: searchTerm, facilities: facilityFilter, activities: activityFilter,
    operational: operationalFilter, priceRange: priceFilter, now
  });
  function toggleFacility(key) {
    setFacilityFilter((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }
  function toggleActivity(key) {
    setActivityFilter((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }
  return <section className="content-section explore-section">
    <span className="eyebrow">DIREKTORI WARKOP</span>
    <h2>Cari warkop di Lamongan.</h2>
    <p>Temukan warkop yang ramai, punya acara, dekat dengan lokasi, atau baru bergabung. Semua hasil hanya menampilkan warkop terverifikasi.</p>
    <div className="directory-discovery-tabs" role="group" aria-label="Kategori direktori">
      <button type="button" className={discoveryCategory === 'popular' ? 'active' : ''} aria-pressed={discoveryCategory === 'popular'} onClick={() => selectDiscoveryCategory('popular')}><span>♥</span><b>Populer</b><small>Paling diikuti</small></button>
      <button type="button" className={discoveryCategory === 'events' ? 'active' : ''} aria-pressed={discoveryCategory === 'events'} onClick={() => selectDiscoveryCategory('events')}><span>◷</span><b>Ada Event Sekarang</b><small>Sedang berlangsung & akan datang</small></button>
      <button type="button" className={discoveryCategory === 'nearby' ? 'active' : ''} aria-pressed={discoveryCategory === 'nearby'} onClick={() => selectDiscoveryCategory('nearby')}><span>⌖</span><b>Terdekat</b><small>Jarak dari Anda</small></button>
      <button type="button" className={discoveryCategory === 'newest' ? 'active' : ''} aria-pressed={discoveryCategory === 'newest'} onClick={() => selectDiscoveryCategory('newest')}><span>✦</span><b>Warkop Terbaru</b><small>Baru terverifikasi</small></button>
    </div>
    <label className="search directory-search"><span>⌕</span><input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Cari nama, alamat, fasilitas…" aria-label="Cari warkop"/></label>
    <div className="directory-filters" role="group" aria-label="Filter warkop">
      <label>Operasional<select aria-label="Filter operasional" value={operationalFilter} onChange={(e) => setOperationalFilter(e.target.value)}><option value="semua">Semua status</option><option value="buka-sekarang">Buka sekarang</option><option value="buka-24-jam">Buka 24 jam</option></select></label>
      
      <div className="directory-filter-group"><strong>Aktivitas</strong><div className="facility-filter-list">{ACTIVITY_OPTIONS.map((activity) => <button type="button" key={activity.value} className={activityFilter.includes(activity.value) ? 'facility-chip active' : 'facility-chip'} aria-pressed={activityFilter.includes(activity.value)} onClick={() => toggleActivity(activity.value)}>{activity.label}</button>)}</div></div>
      {facilityOptions.length > 0 && <div className="directory-filter-group"><strong>Fasilitas</strong><div className="facility-filter-list">{facilityOptions.map((facility) => <button type="button" key={facility.key} className={facilityFilter.includes(facility.key) ? 'facility-chip active' : 'facility-chip'} aria-pressed={facilityFilter.includes(facility.key)} onClick={() => toggleFacility(facility.key)}>{facility.label}</button>)}</div></div>}
      {hasActiveFilter && <button type="button" className="button button-quiet" onClick={() => { setSearchTerm(''); setFacilityFilter([]); setActivityFilter([]); setOperationalFilter('semua'); }}>Hapus filter</button>}
    </div>
    {status === 'loading' && <div className="empty-state" role="status"><h3>Memuat direktori…</h3><p>Mohon tunggu sebentar.</p></div>}
    {status === 'error' && <div className="empty-state" role="alert"><h3>Direktori belum dapat dimuat</h3><p>Periksa koneksi dan konfigurasi Firebase, lalu coba lagi.</p><button className="button button-quiet" type="button" onClick={() => setDirectoryRetry((attempt) => attempt + 1)}>Coba lagi</button></div>}
    {discoveryCategory === 'popular' && popularStatus === 'loading' && <p className="directory-category-status" role="status">Menghitung pengikut warkop…</p>}
    {discoveryCategory === 'popular' && popularStatus === 'error' && <p className="directory-category-status" role="status">Sebagian hitungan pengikut belum tersedia. Urutan berdasarkan data yang berhasil dibaca.</p>}
    {discoveryCategory === 'events' && eventsStatus === 'loading' && <p className="directory-category-status" role="status">Memuat acara warkop…</p>}
    {discoveryCategory === 'events' && eventsStatus === 'error' && <div className="empty-state" role="alert"><h3>Acara belum dapat dimuat</h3><p>Periksa koneksi lalu pilih kategori ini kembali.</p></div>}
    {discoveryCategory === 'nearby' && locationStatus === 'loading' && <p className="directory-category-status" role="status">Meminta lokasi perangkat…</p>}
    {discoveryCategory === 'nearby' && !visitorLocation && locationStatus !== 'loading' && <div className="directory-location-note" role="status"><p>{locationStatus === 'denied' ? 'Izin lokasi ditolak.' : locationStatus === 'unsupported' ? 'Perangkat tidak mendukung lokasi.' : 'Aktifkan izin lokasi untuk mengurutkan warkop dari yang paling dekat.'} Anda tetap dapat melihat direktori tanpa GPS.</p><button className="button button-quiet" type="button" onClick={() => { setLocationStatus('idle'); selectDiscoveryCategory('nearby'); }}>Coba GPS lagi</button></div>}
    {discoveryCategory === 'events' && eventsStatus === 'ready' && discoveryEvents.length === 0 && <p className="directory-category-status">Belum ada acara aktif atau mendatang yang terhubung ke warkop terverifikasi.</p>}
    {discoveryCategory === 'popular' && popularStatus === 'ready' && visibleWarungs.length === 0 && <p className="directory-category-status">Belum ada warkop dengan pengikut. Ikuti warkop favorit untuk membantu komunitas menemukannya.</p>}
    {status === 'ready' && searchingAll && visibleWarungs.length === 0 && <div className="empty-state" role="status"><h3>Menelusuri seluruh direktori…</h3><p>Memeriksa halaman warkop berikutnya agar hasil pencarian tidak terlewat.</p></div>}
    {status === 'ready' && !searchingAll && visibleWarungs.length === 0 && !(discoveryCategory === 'popular' && popularStatus === 'loading') && !(discoveryCategory === 'events' && eventsStatus === 'loading') && <div className="empty-state"><span><Store size={24}/></span><h3>{hasActiveFilter ? 'Warkop tidak ditemukan' : 'Belum ada warkop terverifikasi'}</h3><p>{hasActiveFilter ? 'Coba kata kunci atau filter lain.' : 'Warkop yang menunggu verifikasi tidak ditampilkan ke publik.'}</p></div>}
    {status === 'ready' && warungs.length > 0 && <p className="directory-result-count" aria-live="polite">Menampilkan {visibleWarungs.length} dari {warungs.length} warkop yang sudah dimuat{searchingAll ? ' · sedang memeriksa halaman berikutnya' : hasMore ? ' · masih ada halaman berikutnya' : ''}.</p>}
    <div className="warung-list">{visibleWarungs.map((item) => {
      const primaryPhoto = Array.isArray(item.photos) ? item.photos.find((photo) => typeof photo === 'string' && photo.trim()) : '';
      const openState = item.openingHours?.is24Hours === true ? true : isOpenNow(item, now);
      const event = eventByWarung.get(item.id);
      const distance = distances[item.id];
      const highlights = [...(item.specialties || []), ...(item.activities || []).map((activity) => ACTIVITY_OPTIONS.find((option) => option.value === activity)?.label || activity), ...(item.facilities || [])].filter(Boolean).slice(0, 5);
      return <article className="warung-card" key={item.id}>
        {primaryPhoto
          ? <div className="warung-card-media"><img src={primaryPhoto} alt={`Foto utama ${item.name}`} loading="lazy" decoding="async"/></div>
          : <div className="warung-card-media warung-card-media-placeholder" role="img" aria-label={`Foto warkop belum tersedia untuk ${item.name}`}><Store size={34}/><span>Warkop pilihan lokal</span></div>}
        <div className="warung-card-body">
          <div className="warung-card-heading">
            <div><span className="warung-card-kicker"><ShieldCheck size={12}/> TERKURASI WARKOPLINK</span><h3>{item.name}</h3></div>
            {openState === true ? <span className="warung-card-status is-open"><span/> Buka</span> : openState === false ? <span className="warung-card-status is-closed"><span/> Tutup</span> : null}
          </div>
          <p className="warung-card-address"><MapPin size={15}/>{item.address}</p>
          {discoveryCategory === 'popular' && Number.isFinite(followerCounts[item.id]) && <small className="directory-card-signal">♥ {followerCounts[item.id]} pengikut</small>}
          {discoveryCategory === 'nearby' && Number.isFinite(distance) && <small className="directory-card-signal"><MapPin size={13}/> ±{distance < 10 ? distance.toFixed(1) : Math.round(distance)} km · garis lurus</small>}
          {discoveryCategory === 'events' && event && <div className="directory-event-signal"><b>{new Date(event.eventStartAt || event.eventDate).getTime() <= now.getTime() && event.eventEndAt && new Date(event.eventEndAt).getTime() >= now.getTime() ? 'SEDANG BERLANGSUNG' : 'AKAN DATANG'}</b><span>{event.eventKind || 'Acara warkop'} · {event.body?.split('\n')[0] || 'Lihat detail acara'}</span></div>}
          {highlights.length > 0 && <div className="facility-tags warung-card-highlights">{highlights.map((highlight, index) => <span key={`${highlight}-${index}`}>{highlight}</span>)}</div>}
          {item.ambience && <p className="warung-card-ambience">{item.ambience}</p>}
          <div className="warung-card-meta">
            {item.openingHours?.is24Hours === true ? <small><Clock size={13}/> Buka 24 jam</small> : item.openingHours?.keterangan && !item.openingHours?.schedule ? <small><Clock size={13}/> Jam buka: {item.openingHours.keterangan}</small> : null}

          </div>
          <div className="warung-card-actions">
            <button className="button button-dark" type="button" onClick={() => onOpenWarung?.(item.id)} aria-label={`Lihat detail ${item.name}`}>Lihat detail <ArrowUpRight size={15}/></button>
            {Number.isFinite(item.coordinates?.lat) && Number.isFinite(item.coordinates?.lng) && <a className="warung-map-link" aria-label="Lihat lokasi di peta" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.coordinates.lat},${item.coordinates.lng}`)}`} target="_blank" rel="noopener noreferrer">Lokasi <MapPin size={14}/></a>}
          </div>
        </div>
      </article>;
    })}</div>
    {moreError && <p className="form-error" role="alert">{moreError}</p>}
    {hasMore && <button className="button button-quiet" type="button" onClick={handleLoadMore} disabled={loadingMore || searchingAll}>{searchingAll ? 'Menelusuri direktori…' : loadingMore ? 'Memuat…' : 'Muat 30 warkop lagi'}</button>}
    <button className="button button-dark directory-register-cta" type="button" onClick={onRegister}>Ajukan Warkop</button>
  </section>;
}
