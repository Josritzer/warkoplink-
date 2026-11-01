import { useEffect, useState } from 'react';
import { addDoc, collection, doc, getCountFromServer, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, startAfter, where } from 'firebase/firestore';
import { photoUploadErrorMessage, uploadWarkopMedia } from '../media/uploadWarkopMedia.js';
import { MAX_WARUNG_PHOTOS, validateImageFiles } from '../media/imagePolicy.js';
import { MapPin, Store, ShieldCheck, ArrowUpRight, Clock, LocateFixed, Flame, CalendarDays, Navigation, Sparkles } from 'lucide-react';
import { ACTIVITY_OPTIONS, collectFacilities, filterWarungs, getEventLifecycle, isOpenNow, sortDirectoryWarungs } from './directoryFilters.js';
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
  const [category, setCategory] = useState('popular');
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [followerCounts, setFollowerCounts] = useState({});
  const [popularLoading, setPopularLoading] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [locatingUser, setLocatingUser] = useState(false);
  const [locationError, setLocationError] = useState('');
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


  useEffect(() => {
    if (mode !== 'directory' || category !== 'events' || !db) {
      setEvents([]);
      setEventsLoading(false);
      return undefined;
    }
    setEventsLoading(true);
    const eventsQuery = query(
      collection(db, 'posts'),
      where('topic', '==', 'Info & Acara'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    return onSnapshot(eventsQuery, (snapshot) => {
      setEvents(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => item.warungId && ['ongoing', 'upcoming'].includes(getEventLifecycle(item, new Date()))));
      setEventsLoading(false);
    }, () => {
      setEvents([]);
      setEventsLoading(false);
    });
  }, [mode, category, db]);

  useEffect(() => {
    if (mode !== 'directory' || category !== 'popular' || !db || !warungs.length) {
      setPopularLoading(false);
      return undefined;
    }
    let cancelled = false;
    async function loadFollowerCounts() {
      setPopularLoading(true);
      const counts = {};
      try {
        // Batas lima permintaan paralel menjaga beban pembacaan tetap terkendali.
        for (let offset = 0; offset < warungs.length && !cancelled; offset += 5) {
          const batch = warungs.slice(offset, offset + 5);
          const results = await Promise.all(batch.map(async (item) => {
            const snapshot = await getCountFromServer(collection(db, 'warungs', item.id, 'followers'));
            return [item.id, snapshot.data().count];
          }));
          results.forEach(([id, count]) => { counts[id] = count; });
          if (!cancelled) setFollowerCounts((current) => ({ ...current, ...Object.fromEntries(results) }));
        }
      } catch {
        // Ranking tetap dapat digunakan dengan data hitungan yang berhasil dibaca.
      } finally {
        if (!cancelled) setPopularLoading(false);
      }
    }
    loadFollowerCounts();
    return () => { cancelled = true; };
  }, [mode, category, db, warungs]);

  function requestDirectoryLocation() {
    if (!navigator.geolocation) {
      setLocationError('Perangkat ini tidak mendukung GPS. Direktori tetap dapat digunakan tanpa jarak.');
      return;
    }
    setLocatingUser(true);
    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setUserLocation({ lat: coords.latitude, lng: coords.longitude });
        setLocationError('');
        setLocatingUser(false);
      },
      (error) => {
        setLocationError(error.code === 1
          ? 'Izin lokasi belum diberikan. Aktifkan izin lokasi untuk mengurutkan warkop terdekat.'
          : 'Lokasi belum berhasil ditemukan. Aktifkan GPS lalu coba lagi.');
        setLocatingUser(false);
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }
    );
  }

  function handleCategoryChange(nextCategory) {
    setCategory(nextCategory);
    if (nextCategory === 'nearby' && !userLocation && !locatingUser) requestDirectoryLocation();
  }

  const hasActiveFilter = Boolean(searchTerm.trim()) || facilityFilter.length > 0 || activityFilter.length > 0 || operationalFilter !== 'semua';

  // Ketika pengguna mencari atau memfilter, perluas seluruh halaman verified secara otomatis.
  // Tanpa ini, hasil di halaman ke-2 dan seterusnya tidak pernah ikut diperiksa.
  useEffect(() => {
    if (mode !== 'directory' || !db || status !== 'ready' || !hasActiveFilter || !hasMore || !lastDocument) return undefined;
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
  }, [mode, db, status, hasActiveFilter, hasMore, lastDocument, directoryRetry]);


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
  const visibleWarungs = filterWarungs(warungs, { search: searchTerm, facilities: facilityFilter, activities: activityFilter, operational: operationalFilter, now });
  const orderedWarungs = sortDirectoryWarungs(visibleWarungs, category, { followerCounts, origin: userLocation, events, now });
  function toggleFacility(key) {
    setFacilityFilter((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }
  function toggleActivity(key) {
    setActivityFilter((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }
  return <section className="content-section explore-section">
    <span className="eyebrow">DIREKTORI WARKOP</span>
    <h2>Cari warkop di Lamongan.</h2>
    <p>Direktori publik hanya menampilkan warkop terverifikasi. Temukan warkop populer, agenda acara, lokasi terdekat, atau yang baru bergabung. Data dimuat bertahap; pencarian dan filter memeriksa halaman berikutnya agar hasil tidak terlewat.</p>

    <div className="directory-category-tabs" role="group" aria-label="Kategori penemuan warkop">
      <button type="button" className={category === 'popular' ? 'directory-category active' : 'directory-category'} aria-pressed={category === 'popular'} onClick={() => handleCategoryChange('popular')}><Flame size={16}/> Populer</button>
      <button type="button" className={category === 'events' ? 'directory-category active' : 'directory-category'} aria-pressed={category === 'events'} onClick={() => handleCategoryChange('events')}><CalendarDays size={16}/> Ada Event Sekarang</button>
      <button type="button" className={category === 'nearby' ? 'directory-category active' : 'directory-category'} aria-pressed={category === 'nearby'} onClick={() => handleCategoryChange('nearby')}><Navigation size={16}/> Terdekat</button>
      <button type="button" className={category === 'newest' ? 'directory-category active' : 'directory-category'} aria-pressed={category === 'newest'} onClick={() => handleCategoryChange('newest')}><Sparkles size={16}/> Warkop Terbaru</button>
    </div>
    {category === 'popular' && <p className="directory-category-hint">Diurutkan dari jumlah pengikut nyata pada profil warkop. Peringkat mengikuti warkop yang sudah dimuat.</p>}
    {category === 'events' && <p className="directory-category-hint">Menampilkan acara terhubung ke warkop yang sedang berlangsung atau akan datang.</p>}
    {category === 'nearby' && <div className="directory-location-status">
      {userLocation
        ? <span><Navigation size={14}/> Jarak dihitung dari lokasi perangkat dan merupakan perkiraan garis lurus.</span>
        : <span>{locationError || 'Izinkan lokasi perangkat untuk mengurutkan berdasarkan jarak.'}</span>}
      {!userLocation && <button className="button button-quiet" type="button" onClick={requestDirectoryLocation} disabled={locatingUser}>{locatingUser ? 'Mencari lokasi…' : 'Aktifkan lokasi'}</button>}
    </div>}

    <label className="search directory-search"><span>⌕</span><input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Cari nama, alamat, fasilitas…" aria-label="Cari warkop"/></label>
    <div className="directory-filters" role="group" aria-label="Filter warkop">
      <label>Operasional<select aria-label="Filter operasional" value={operationalFilter} onChange={(e) => setOperationalFilter(e.target.value)}><option value="semua">Semua status</option><option value="buka-sekarang">Buka sekarang</option><option value="buka-24-jam">Buka 24 jam</option></select></label>
      
      <div className="directory-filter-group"><strong>Aktivitas</strong><div className="facility-filter-list">{ACTIVITY_OPTIONS.map((activity) => <button type="button" key={activity.value} className={activityFilter.includes(activity.value) ? 'facility-chip active' : 'facility-chip'} aria-pressed={activityFilter.includes(activity.value)} onClick={() => toggleActivity(activity.value)}>{activity.label}</button>)}</div></div>
      {facilityOptions.length > 0 && <div className="directory-filter-group"><strong>Fasilitas</strong><div className="facility-filter-list">{facilityOptions.map((facility) => <button type="button" key={facility.key} className={facilityFilter.includes(facility.key) ? 'facility-chip active' : 'facility-chip'} aria-pressed={facilityFilter.includes(facility.key)} onClick={() => toggleFacility(facility.key)}>{facility.label}</button>)}</div></div>}
      {hasActiveFilter && <button type="button" className="button button-quiet" onClick={() => { setSearchTerm(''); setFacilityFilter([]); setActivityFilter([]); setOperationalFilter('semua'); }}>Hapus filter</button>}
    </div>
    {status === 'loading' && <div className="empty-state" role="status"><h3>Memuat direktori…</h3><p>Mohon tunggu sebentar.</p></div>}
    {status === 'error' && <div className="empty-state" role="alert"><h3>Direktori belum dapat dimuat</h3><p>Periksa koneksi dan konfigurasi Firebase, lalu coba lagi.</p><button className="button button-quiet" type="button" onClick={() => setDirectoryRetry((attempt) => attempt + 1)}>Coba lagi</button></div>}
    {status === 'ready' && searchingAll && visibleWarungs.length === 0 && <div className="empty-state" role="status"><h3>Menelusuri seluruh direktori…</h3><p>Memeriksa halaman warkop berikutnya agar hasil pencarian tidak terlewat.</p></div>}
    {status === 'ready' && category === 'events' && eventsLoading && <div className="empty-state" role="status"><h3>Memuat agenda warkop…</h3><p>Mencari acara yang masih aktif dan akan datang.</p></div>}
    {status === 'ready' && !searchingAll && !eventsLoading && orderedWarungs.length === 0 && <div className="empty-state"><span><Store size={24}/></span><h3>{category === 'events' ? 'Belum ada event aktif' : hasActiveFilter ? 'Warkop tidak ditemukan' : 'Belum ada warkop terverifikasi'}</h3><p>{category === 'events' ? 'Belum ada acara yang sedang berlangsung atau akan datang dari warkop terverifikasi.' : hasActiveFilter ? 'Coba kata kunci atau filter lain.' : 'Warkop yang menunggu verifikasi tidak ditampilkan ke publik.'}</p></div>}
    {status === 'ready' && warungs.length > 0 && <p className="directory-result-count" aria-live="polite">Menampilkan {orderedWarungs.length} dari {warungs.length} warkop yang sudah dimuat{searchingAll ? ' · sedang memeriksa halaman berikutnya' : hasMore ? ' · masih ada halaman berikutnya' : ''}{category === 'popular' && popularLoading ? ' · menghitung pengikut…' : ''}.</p>}
    <div className="warung-list">{orderedWarungs.map((item) => {
      const primaryPhoto = Array.isArray(item.photos) ? item.photos.find((photo) => typeof photo === 'string' && photo.trim()) : '';
      const openState = item.openingHours?.is24Hours === true ? true : isOpenNow(item, now);
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
          {item.activeEvent && <div className="directory-event-badge"><CalendarDays size={14}/><span>{getEventLifecycle(item.activeEvent, now) === 'ongoing' ? 'SEDANG BERLANGSUNG' : 'AKAN DATANG'} · {String(item.activeEvent.eventKind || 'Acara warkop')}</span></div>}
          {category === 'popular' && Object.prototype.hasOwnProperty.call(followerCounts, item.id) && <small className="directory-ranking-meta"><Flame size={13}/> {followerCounts[item.id].toLocaleString('id-ID')} pengikut</small>}
          {category === 'nearby' && item.distanceKm !== null && <small className="directory-ranking-meta"><Navigation size={13}/> {item.distanceKm < 1 ? Math.round(item.distanceKm * 1000) + ' m' : item.distanceKm.toFixed(1) + ' km'} · perkiraan</small>}
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
