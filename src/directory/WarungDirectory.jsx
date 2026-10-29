import { useEffect, useState } from 'react';
import { addDoc, collection, endAt, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, startAfter, startAt, where } from 'firebase/firestore';
import { MapPin, Store, ShieldCheck, ArrowUpRight } from 'lucide-react';
import { PRICE_FILTER_OPTIONS, collectFacilities, filterWarungs, mergeWarungs, namePrefixRange, normalizeNameKey } from './directoryFilters.js';

export default function WarungDirectory({ mode, user, db, onRequestAuth, onNotice, onOpenWarung, onRegister }) {
  const [warungs, setWarungs] = useState([]);
  const [status, setStatus] = useState(db ? 'loading' : 'error');
  const [directoryRetry, setDirectoryRetry] = useState(0);
  const [lastDocument, setLastDocument] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [serverResults, setServerResults] = useState([]);
  const [searchState, setSearchState] = useState('idle');
  const [searchRetry, setSearchRetry] = useState(0);
  const [priceFilter, setPriceFilter] = useState('semua');
  const [facilityFilter, setFacilityFilter] = useState([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [facilities, setFacilities] = useState('');
  const [priceRange, setPriceRange] = useState('belum-diisi');
  const [hours, setHours] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

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
      orderBy('nameNormalized', 'asc'),
      limit(30)
    );
    return onSnapshot(verifiedQuery, (snapshot) => {
      setWarungs(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      setLastDocument(snapshot.docs.at(-1) || null);
      setHasMore(snapshot.docs.length === 30);
      setStatus('ready');
    }, () => setStatus('error'));
  }, [mode, db, directoryRetry]);

  // Pencarian nama ke seluruh direktori terverifikasi (prefix), bukan hanya 30 data yang sudah dimuat.
  // Memakai indeks verificationStatus + nameNormalized yang sudah ada; tidak mengubah data.
  useEffect(() => {
    const range = namePrefixRange(searchTerm);
    if (mode !== 'directory' || !db || !range) {
      setServerResults([]);
      setSearchState('idle');
      return undefined;
    }
    let cancelled = false;
    setSearchState('loading');
    const timer = setTimeout(async () => {
      try {
        const snapshot = await getDocs(query(
          collection(db, 'warungs'),
          where('verificationStatus', '==', 'verified'),
          orderBy('nameNormalized', 'asc'),
          startAt(range.start),
          endAt(range.end),
          limit(30)
        ));
        if (cancelled) return;
        setServerResults(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        setSearchState('done');
      } catch {
        if (cancelled) return;
        setServerResults([]);
        setSearchState('error');
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mode, db, searchTerm, searchRetry]);

  async function handleRegister(event) {
    event.preventDefault();
    if (!user) {
      onRequestAuth();
      onNotice('Masuk atau buat akun terlebih dahulu untuk mendaftarkan warkop.');
      return;
    }
    if (!db) return setFormError('Firebase belum dikonfigurasi.');
    const cleanName = name.trim();
    const cleanAddress = address.trim();
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (cleanName.length < 2 || cleanName.length > 100) return setFormError('Nama warkop harus 2–100 karakter.');
    if (cleanAddress.length < 5 || cleanAddress.length > 300) return setFormError('Alamat harus 5–300 karakter.');
    if (!lat.trim() || !lng.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return setFormError('Masukkan koordinat lintang (-90 sampai 90) dan bujur (-180 sampai 180) yang valid.');
    }
    const facilityList = [...new Set(facilities.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))];
    if (facilityList.length > 20) return setFormError('Maksimal 20 fasilitas.');
    setSaving(true);
    setFormError('');
    try {
      await addDoc(collection(db, 'warungs'), {
        name: cleanName,
        nameNormalized: normalizeNameKey(cleanName),
        ownerUid: user.uid,
        coordinates: { lat: latitude, lng: longitude },
        address: cleanAddress,
        regionCode: 'lamongan-kab',
        facilities: facilityList,
        priceRange,
        openingHours: hours.trim() ? { keterangan: hours.trim().slice(0, 120) } : {},
        photos: [],
        verificationStatus: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setName('');
      setAddress('');
      setLat('');
      setLng('');
      setFacilities('');
      setPriceRange('belum-diisi');
      setHours('');
      onNotice('Pendaftaran terkirim. Warkop menunggu verifikasi dan belum tampil di direktori publik.');
    } catch (error) {
      setFormError(error?.code === 'permission-denied'
        ? 'Pendaftaran ditolak oleh aturan keamanan. Pastikan Anda sudah masuk dan coba lagi.'
        : 'Pendaftaran belum berhasil. Periksa koneksi lalu coba lagi.');
    } finally {
      setSaving(false);
    }
  }

  async function handleLoadMore() {
    if (!db || !lastDocument || loadingMore || !hasMore) return;
    setLoadingMore(true);
    setMoreError('');
    try {
      const nextQuery = query(
        collection(db, 'warungs'),
        where('verificationStatus', '==', 'verified'),
        orderBy('nameNormalized', 'asc'),
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
      <h2>Daftarkan warkop Anda.</h2>
      <p>Isi data yang benar. Pendaftaran berstatus menunggu sampai admin memeriksanya; warkop baru tampil di direktori publik setelah disetujui.</p>
      {!user && <div className="directory-notice"><ShieldCheck size={18}/><span>Anda perlu masuk ke akun untuk mengirim pendaftaran.</span><button className="button button-dark" onClick={onRequestAuth}>Masuk / Daftar akun</button></div>}
      <form className="warung-form" onSubmit={handleRegister}>
        <label>Nama warkop<input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required placeholder="Contoh: Warkop Pojok"/></label>
        <label>Alamat lengkap di Kabupaten Lamongan<textarea value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} required rows={3} placeholder="Nama jalan, desa, kecamatan"/></label>
        <div className="coordinate-fields">
          <label>Lintang (latitude)<input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} required placeholder="-7.0001"/></label>
          <label>Bujur (longitude)<input inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} required placeholder="112.2810"/></label>
        </div>
        <label>Fasilitas, pisahkan dengan koma<input value={facilities} onChange={(e) => setFacilities(e.target.value)} placeholder="Wi-Fi, parkir, toilet"/></label>
        <label>Kisaran harga<select value={priceRange} onChange={(e) => setPriceRange(e.target.value)}><option value="belum-diisi">Belum diisi</option><option value="hemat">Hemat</option><option value="sedang">Sedang</option><option value="premium">Premium</option></select></label>
        <label>Jam buka (opsional)<input value={hours} onChange={(e) => setHours(e.target.value)} maxLength={120} placeholder="Contoh: Setiap hari, 08.00–23.00"/></label>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <button className="button button-dark" type="submit" disabled={saving}>{saving ? 'Mengirim pendaftaran…' : 'Kirim pendaftaran'}</button>
      </form>
    </section>;
  }

  const facilityOptions = collectFacilities(warungs);
  const visibleWarungs = mergeWarungs(
    filterWarungs(warungs, { search: searchTerm, price: priceFilter, facilities: facilityFilter }),
    filterWarungs(serverResults, { price: priceFilter, facilities: facilityFilter })
  );
  const searching = searchState === 'loading';
  const searchFailed = searchState === 'error';
  const hasActiveFilter = Boolean(searchTerm.trim()) || priceFilter !== 'semua' || facilityFilter.length > 0;
  function toggleFacility(key) {
    setFacilityFilter((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }
  return <section className="content-section explore-section">
    <span className="eyebrow">DIREKTORI WARKOP</span>
    <h2>Cari warkop di Lamongan.</h2>
    <p>Direktori publik hanya menampilkan warkop terverifikasi. Data dimuat bertahap, 30 entri per permintaan. Hasil diurutkan berdasarkan nama. Pencarian awalan nama mencari ke seluruh direktori; pencarian alamat dan fasilitas berlaku pada data yang sudah dimuat.</p>
    <label className="search directory-search"><span>⌕</span><input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Cari nama, alamat, fasilitas…" aria-label="Cari warkop"/></label>
    <div className="directory-filters" role="group" aria-label="Filter warkop">
      <label>Kisaran harga<select value={priceFilter} onChange={(e) => setPriceFilter(e.target.value)}>{PRICE_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      {facilityOptions.length > 0 && <div className="facility-filter-list">{facilityOptions.map((facility) => <button type="button" key={facility.key} className={facilityFilter.includes(facility.key) ? 'facility-chip active' : 'facility-chip'} aria-pressed={facilityFilter.includes(facility.key)} onClick={() => toggleFacility(facility.key)}>{facility.label}</button>)}</div>}
      {hasActiveFilter && <button type="button" className="button button-quiet" onClick={() => { setSearchTerm(''); setPriceFilter('semua'); setFacilityFilter([]); }}>Hapus filter</button>}
    </div>
    {status === 'loading' && <div className="empty-state" role="status"><h3>Memuat direktori…</h3><p>Mohon tunggu sebentar.</p></div>}
    {status === 'error' && <div className="empty-state" role="alert"><h3>Direktori belum dapat dimuat</h3><p>Periksa koneksi dan konfigurasi Firebase, lalu coba lagi.</p><button className="button button-quiet" type="button" onClick={() => setDirectoryRetry((attempt) => attempt + 1)}>Coba lagi</button></div>}
    {searching && <p className="directory-result-count" role="status">Mencari warkop…</p>}
    {searchFailed && <div className="empty-state" role="alert"><h3>Pencarian belum dapat dimuat</h3><p>Periksa koneksi, lalu coba lagi. Hasil dari data yang sudah dimuat tetap ditampilkan.</p><button className="button button-quiet" type="button" onClick={() => setSearchRetry((attempt) => attempt + 1)}>Coba cari lagi</button></div>}
    {status === 'ready' && !searching && !searchFailed && visibleWarungs.length === 0 && <div className="empty-state"><span><Store size={24}/></span><h3>{hasActiveFilter ? 'Warkop tidak ditemukan' : 'Belum ada warkop terverifikasi'}</h3><p>{hasActiveFilter ? 'Coba kata kunci atau filter lain.' : 'Warkop yang menunggu verifikasi tidak ditampilkan ke publik.'}</p></div>}
    {status === 'ready' && warungs.length > 0 && <p className="directory-result-count" aria-live="polite">Menampilkan {visibleWarungs.length} warkop{hasActiveFilter ? '' : ` dari ${warungs.length} yang sudah dimuat${hasMore ? ' · masih ada halaman berikutnya' : ''}`}.</p>}
    <div className="warung-list">{visibleWarungs.map((item) => <article className="warung-card" key={item.id}>
      <div className="warung-card-icon"><Store size={22}/></div><div className="warung-card-body"><h3><button className="warung-profile-link" type="button" onClick={() => onOpenWarung?.(item.id)}>{item.name} <ArrowUpRight size={14}/></button></h3><p><MapPin size={14}/>{item.address}</p>
      <div className="facility-tags">{(item.facilities || []).map((facility) => <span key={facility}>{facility}</span>)}</div>
      <small>{item.priceRange === 'belum-diisi' ? 'Kisaran harga belum diisi' : 'Kisaran harga: ' + item.priceRange}</small>
      {item.openingHours?.keterangan && <small>Jam buka: {item.openingHours.keterangan}</small>}
      {Number.isFinite(item.coordinates?.lat) && Number.isFinite(item.coordinates?.lng) && <a className="warung-map-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.coordinates.lat},${item.coordinates.lng}`)}`} target="_blank" rel="noopener noreferrer">Lihat lokasi di peta <ArrowUpRight size={13}/></a>}
      </div>
    </article>)}</div>
    {moreError && <p className="form-error" role="alert">{moreError}</p>}
    {hasMore && <button className="button button-quiet" type="button" onClick={handleLoadMore} disabled={loadingMore}>{loadingMore ? 'Memuat…' : 'Muat 30 warkop lagi'}</button>}
    <button className="button button-dark directory-register-cta" type="button" onClick={onRegister}>Daftarkan warkop</button>
  </section>;
}
