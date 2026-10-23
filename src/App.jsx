import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword,
  signOut, updateProfile
} from 'firebase/auth';
import {
  addDoc, collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, startAfter, where
} from 'firebase/firestore';
import { auth, db, firebaseConfigured } from './firebase.js';
import AdminPanel from './AdminPanel.jsx';
import { MessageCircle, Users, BookOpen, Sparkles, ShieldCheck, Heart, ArrowUpRight, LogOut, Home, Compass, UserRound, Download, MapPin, Store } from 'lucide-react';
import {
  FILTER_TOPICS, MAX_POST_LENGTH, POST_TOPICS, authErrorMessage, authorNameFor, filterPosts,
  postErrorMessage, validateDisplayName, validateEmail, validatePassword, validatePostBody
} from './lib.js';

const POSTS_LIMIT = 100;

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('id')
    .replace(/\s+/g, ' ')
    .trim();
}

function WarungDirectory({ mode, user, db, onRequestAuth, onNotice }) {
  const [warungs, setWarungs] = useState([]);
  const [status, setStatus] = useState(db ? 'loading' : 'error');
  const [lastDocument, setLastDocument] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
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
      limit(30)
    );
    return onSnapshot(verifiedQuery, (snapshot) => {
      setWarungs(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      setLastDocument(snapshot.docs.at(-1) || null);
      setHasMore(snapshot.docs.length === 30);
      setStatus('ready');
    }, () => setStatus('error'));
  }, [mode, db]);

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
        nameNormalized: cleanName.toLowerCase(),
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
        startAfter(lastDocument),
        limit(30)
      );
      const snapshot = await getDocs(nextQuery);
      const nextRows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      setWarungs((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...nextRows.filter((item) => !seen.has(item.id))];
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
      <p>Isi data yang benar. Pendaftaran akan berstatus menunggu sampai proses verifikasi tersedia.</p>
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

  const normalizedSearch = normalizeSearchText(searchTerm);
  const visibleWarungs = warungs.filter((item) => {
    const haystack = normalizeSearchText([item.name, item.address, ...(item.facilities || [])].join(' '));
    return haystack.includes(normalizedSearch);
  });
  return <section className="content-section explore-section">
    <span className="eyebrow">DIREKTORI WARKOP</span>
    <h2>Cari warkop di Lamongan.</h2>
    <p>Direktori publik hanya menampilkan warkop terverifikasi. Data dimuat bertahap, 30 entri per permintaan. Pencarian memfilter data yang sudah dimuat; muat halaman berikutnya untuk menelusuri lebih banyak hasil.</p>
    <label className="search directory-search"><span>⌕</span><input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Cari nama, alamat, fasilitas…" aria-label="Cari warkop"/></label>
    {status === 'loading' && <div className="empty-state" role="status"><h3>Memuat direktori…</h3><p>Mohon tunggu sebentar.</p></div>}
    {status === 'error' && <div className="empty-state" role="alert"><h3>Direktori belum dapat dimuat</h3><p>Periksa koneksi dan konfigurasi Firebase, lalu coba lagi nanti.</p></div>}
    {status === 'ready' && visibleWarungs.length === 0 && <div className="empty-state"><span><Store size={24}/></span><h3>{searchTerm ? 'Warkop tidak ditemukan' : 'Belum ada warkop terverifikasi'}</h3><p>{searchTerm ? 'Coba kata kunci lain.' : 'Warkop yang menunggu verifikasi tidak ditampilkan ke publik.'}</p></div>}
    <div className="warung-list">{visibleWarungs.map((item) => <article className="warung-card" key={item.id}>
      <div className="warung-card-icon"><Store size={22}/></div><div className="warung-card-body"><h3>{item.name}</h3><p><MapPin size={14}/>{item.address}</p>
      <div className="facility-tags">{(item.facilities || []).map((facility) => <span key={facility}>{facility}</span>)}</div>
      <small>{item.priceRange === 'belum-diisi' ? 'Kisaran harga belum diisi' : 'Kisaran harga: ' + item.priceRange}</small>
      {item.openingHours?.keterangan && <small>Jam buka: {item.openingHours.keterangan}</small>}
      {Number.isFinite(item.coordinates?.lat) && Number.isFinite(item.coordinates?.lng) && <a className="warung-map-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.coordinates.lat},${item.coordinates.lng}`)}`} target="_blank" rel="noopener noreferrer">Lihat lokasi di peta <ArrowUpRight size={13}/></a>}
      </div>
    </article>)}</div>
    {moreError && <p className="form-error" role="alert">{moreError}</p>}
    {hasMore && <button className="button button-quiet" type="button" onClick={handleLoadMore} disabled={loadingMore}>{loadingMore ? 'Memuat…' : 'Muat 30 warkop lagi'}</button>}
    <button className="button button-dark directory-register-cta" onClick={() => onNotice('Pilih menu Daftarkan Warkop untuk mengirim data.')}>Daftarkan warkop</button>
  </section>;
}

export default function App() {
  const [section, setSection] = useState('Beranda');
  const [topic, setTopic] = useState('Semua');
  const [composerTopic, setComposerTopic] = useState(POST_TOPICS[0]);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [installPrompt, setInstallPrompt] = useState(null);
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authReady, setAuthReady] = useState(!auth);
  const [posts, setPosts] = useState([]);
  const [postsStatus, setPostsStatus] = useState(db ? 'loading' : 'ready');
  const [postsRetry, setPostsRetry] = useState(0);
  const [authOpen, setAuthOpen] = useState(false);
  const [registerMode, setRegisterMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  const [busy, setBusy] = useState(false);
  const [posting, setPosting] = useState(false);
  const registering = useRef(false);

  // Membuat dokumen profil jika akun Auth sudah ada tetapi profil belum tersimpan
  // (misalnya pembuatan profil gagal saat registrasi). Aman dipanggil berulang.
  const ensureProfile = useCallback(async (currentUser) => {
    if (!db || !currentUser) return true;
    try {
      const ref = doc(db, 'profiles', currentUser.uid);
      const existing = await getDoc(ref);
      if (existing.exists()) return true;
      await setDoc(ref, {
        displayName: authorNameFor(currentUser),
        email: currentUser.email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (error) {
      console.warn('Profil belum dapat disimpan:', error?.code || 'unknown');
      return false;
    }
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Aplikasi tetap dapat digunakan jika browser menolak service worker.
      });
    }
    const captureInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const clearInstallPrompt = () => setInstallPrompt(null);
    window.addEventListener('beforeinstallprompt', captureInstallPrompt);
    window.addEventListener('appinstalled', clearInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', captureInstallPrompt);
      window.removeEventListener('appinstalled', clearInstallPrompt);
    };
  }, []);

  async function handleInstallPwa() {
    if (installPrompt) {
      installPrompt.prompt();
      const result = await installPrompt.userChoice;
      setInstallPrompt(null);
      setNotice(result?.outcome === 'accepted'
        ? 'WarkopLink sedang dipasang di perangkat Anda.'
        : 'Pemasangan dibatalkan. Anda bisa memasang aplikasi kapan saja.');
      return;
    }
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setNotice(isIos
      ? 'Untuk memasang di iPhone/iPad: buka menu Bagikan di Safari, lalu pilih “Tambahkan ke Layar Utama”.'
      : 'Jika tombol instal belum muncul, buka menu browser (⋮) lalu pilih “Instal aplikasi” atau “Tambahkan ke layar utama”.');
  }

  useEffect(() => {
    if (!auth) return undefined;
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setIsAdmin(false);
      setAuthReady(true);
      if (nextUser && typeof nextUser.getIdTokenResult === 'function') {
        try {
          const token = await nextUser.getIdTokenResult(true);
          setIsAdmin(token.claims?.admin === true);
        } catch {
          setIsAdmin(false);
        }
      }
      if (nextUser && !registering.current) ensureProfile(nextUser);
    });
  }, [ensureProfile]);

  useEffect(() => {
    if (!db) return undefined;
    setPostsStatus('loading');
    const postsQuery = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(POSTS_LIMIT));
    return onSnapshot(postsQuery, (snapshot) => {
      setPosts(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      setPostsStatus('ready');
    }, () => setPostsStatus('error'));
  }, [postsRetry]);

  function openAuth(register) {
    setRegisterMode(register);
    setAuthError('');
    setAuthOpen(true);
  }

  async function handleAuth(event) {
    event.preventDefault();
    if (!auth || !db) {
      setAuthError('Firebase belum dikonfigurasi. Isi variabel VITE_FIREBASE_* terlebih dahulu.');
      return;
    }
    const emailCheck = validateEmail(email);
    if (!emailCheck.ok) return setAuthError(emailCheck.error);
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.ok) return setAuthError(passwordCheck.error);
    const nameCheck = registerMode ? validateDisplayName(displayName) : { ok: true };
    if (!nameCheck.ok) return setAuthError(nameCheck.error);

    setAuthError('');
    setBusy(true);
    let profileSaved = true;
    try {
      if (registerMode) {
        registering.current = true;
        const result = await createUserWithEmailAndPassword(auth, emailCheck.value, passwordCheck.value);
        try {
          await updateProfile(result.user, { displayName: nameCheck.value });
          await setDoc(doc(db, 'profiles', result.user.uid), {
            displayName: nameCheck.value,
            email: result.user.email,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        } catch (profileError) {
          // Akun sudah terbuat dan pengguna sudah masuk; profil akan dicoba lagi otomatis.
          profileSaved = false;
        }
        setNotice(profileSaved
          ? 'Akun berhasil dibuat. Selamat bergabung!'
          : 'Akun berhasil dibuat, tetapi profil belum tersimpan. Kami akan mencoba lagi otomatis saat Anda masuk berikutnya.');
      } else {
        await signInWithEmailAndPassword(auth, emailCheck.value, passwordCheck.value);
        setNotice('Berhasil masuk ke WarkopLink.');
      }
      setAuthOpen(false);
      setEmail('');
      setPassword('');
      setDisplayName('');
    } catch (error) {
      setAuthError(authErrorMessage(error));
    } finally {
      registering.current = false;
      setBusy(false);
    }
  }

  async function handlePost(event) {
    event.preventDefault();
    if (!user) {
      openAuth(false);
      setNotice('Masuk atau buat akun terlebih dahulu untuk mengirim obrolan.');
      return;
    }
    const bodyCheck = validatePostBody(draft);
    if (!bodyCheck.ok) return setNotice(bodyCheck.error);
    if (!db) return setNotice('Firebase belum dikonfigurasi.');
    setPosting(true);
    try {
      // Aturan keamanan mencocokkan nama penulis dengan profil, jadi pastikan profil ada.
      const hasProfile = await ensureProfile(user);
      if (!hasProfile) {
        setNotice('Profil Anda belum tersimpan sehingga pesan belum dapat dikirim. Coba lagi sebentar lagi.');
        return;
      }
      await addDoc(collection(db, 'posts'), {
        authorId: user.uid,
        authorName: authorNameFor(user),
        body: bodyCheck.value,
        topic: composerTopic,
        createdAt: serverTimestamp()
      });
      setDraft('');
      setNotice('Obrolan berhasil dipublikasikan.');
    } catch (error) {
      setNotice(postErrorMessage(error));
    } finally {
      setPosting(false);
    }
  }

  async function handleSignOut() {
    if (!auth) return;
    try {
      await signOut(auth);
      setNotice('Anda sudah keluar dari akun.');
    } catch (error) {
      setNotice('Gagal keluar. Silakan coba lagi.');
    }
  }

  const visiblePosts = filterPosts(posts, topic, search);

  return <div className="app-shell">
    <header className="topbar app-header">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setSection('Beranda'); }}>
        <span className="brand-mark"><Sparkles size={21}/></span>
        <span><strong>WARKOPLINK</strong><small>Ruang obrolan Indonesia</small></span>
      </a>
      <div className="header-actions">
        <button className="button button-install" onClick={handleInstallPwa}><Download size={15}/> <span>Pasang PWA</span></button>
        {!authReady ? <button className="button button-dark" disabled>Memuat…</button> :
          user ? <button className="button button-dark" onClick={handleSignOut}><LogOut size={15}/> Keluar</button> :
          <><button className="button button-quiet" onClick={() => openAuth(false)}>Masuk</button><button className="button button-dark" onClick={() => openAuth(true)}>Gabung komunitas</button></>}
      </div>
    </header>

    <main>
      {section === 'Panel Admin' && isAdmin ? <AdminPanel db={db} user={user} onNotice={setNotice}/> :
      section === 'Panel Admin' ? <section className="content-section"><h2>Akses admin tidak tersedia</h2><p>Akun ini tidak memiliki hak admin. Masuk menggunakan akun admin resmi atau kembali ke beranda.</p><button className="button button-dark" onClick={() => setSection('Beranda')}>Kembali</button></section> :
      section === 'Akun' ? <section className="content-section account-section">
        <span className="eyebrow">AKUN ANDA</span><h2>Profil komunitas</h2>
        {user ? <><article className="account-card"><div className="account-avatar">{String(user.displayName || user.email || 'A').slice(0,1).toUpperCase()}</div><div><b>{user.displayName || 'Anggota SL'}</b><p>{user.email}</p><small>Akun Anda siap untuk ikut berdiskusi.</small></div><button className="button button-dark" onClick={handleSignOut}><LogOut size={15}/> Keluar</button></article>{isAdmin && <button className="button button-dark admin-entry-button" onClick={() => setSection('Panel Admin')}><ShieldCheck size={16}/> Buka Panel Admin</button>}</> :
          <article className="account-card"><div className="account-avatar"><UserRound size={25}/></div><div><b>Gabung bersama komunitas</b><p>Buat akun untuk memulai obrolan dan berbagi pengalaman.</p></div><button className="button button-dark" onClick={() => openAuth(true)}>Daftar</button></article>}
      </section> :
      section === 'Tentang' ? <section className="content-section"><span className="eyebrow">TENTANG WARKOPLINK</span><h2>Temukan warkop, kenali lingkungan, terhubung.</h2><p>WarkopLink membantu warga menemukan dan mengenal warkop di Kabupaten Lamongan. Pendaftaran tetap gratis.</p></section> :
      (section === 'Cari Warkop' || section === 'Daftarkan Warkop') ? <WarungDirectory mode={section === 'Cari Warkop' ? 'directory' : 'register'} user={user} db={db} onRequestAuth={() => openAuth(false)} onNotice={setNotice}/> :
      (section === 'Layanan' || section === 'Jelajahi') ? <section className="content-section explore-section"><span className="eyebrow">JELAJAHI</span><h2>Temukan komunitas lokal.</h2><p>Temukan informasi lokal dan mulai percakapan yang bermanfaat.</p><div className="service-grid"><article><MapPin size={24}/><h3>Wilayah awal: Lamongan</h3><p>Fokus pada Kabupaten Lamongan, lalu diperluas bertahap.</p></article><article><Store size={24}/><h3>Pendaftaran gratis</h3><p>Tidak ada biaya untuk mendaftarkan warkop pada tahap awal.</p></article><article><ShieldCheck size={24}/><h3>Verifikasi bertahap</h3><p>Status verifikasi dan hak pemilik harus dikendalikan secara aman.</p></article></div><button className="button button-dark" onClick={() => setSection('Cari Warkop')}>Cari warkop</button></section> :
      <section className="content-section" id="community-feed">
        <div className="section-heading"><div><span className="eyebrow">RUANG BERSAMA</span><h2>Obrolan komunitas</h2><p>Satu percakapan bisa jadi awal dari hal baik.</p></div><span className="status-pill">{user ? 'Masuk sebagai ' + (user.displayName || user.email) : 'Baca obrolan publik'}</span></div>
        {!firebaseConfigured && <p className="config-warning">Firebase belum tersambung. Kode integrasi siap; konfigurasi proyek diperlukan untuk mengaktifkan akun dan database.</p>}
        <div className="feed-tools"><label className="search"><span>⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari obrolan…"/></label></div>
        <div className="topic-list">{FILTER_TOPICS.map(t => <button key={t} onClick={() => setTopic(t)} aria-pressed={topic === t} className={topic === t ? 'topic selected' : 'topic'}>{t}</button>)}</div>
        <form className="composer" onSubmit={handlePost}>
          <textarea aria-label="Isi obrolan" value={draft} onChange={e => setDraft(e.target.value)} maxLength={MAX_POST_LENGTH} placeholder={user ? 'Apa yang ingin kamu bagikan hari ini?' : 'Masuk untuk mulai berbagi obrolan…'} rows={3}/>
          <div className="composer-bottom"><select aria-label="Kategori obrolan" value={composerTopic} onChange={e => setComposerTopic(e.target.value)}>{POST_TOPICS.map(t => <option key={t}>{t}</option>)}</select><small className="char-count" aria-live="polite">{draft.length}/{MAX_POST_LENGTH}</small><button className="button button-dark" type="submit" disabled={posting}>{posting ? 'Mengirim…' : 'Mulai obrolan'} <MessageCircle size={16}/></button></div>
        </form>
        <div className="post-list">
          {postsStatus === 'loading' && <div className="empty-state" role="status"><h3>Memuat obrolan…</h3><p>Mohon tunggu sebentar.</p></div>}
          {postsStatus === 'error' && <div className="empty-state" role="alert"><h3>Obrolan belum dapat dimuat</h3><p>Periksa koneksi internet Anda lalu coba lagi.</p><button className="button button-dark" onClick={() => setPostsRetry(n => n + 1)}>Coba lagi</button></div>}
          {postsStatus === 'ready' && visiblePosts.map(post => <article className="post-card" key={post.id}><div className="post-avatar">{String(post.authorName || 'A').slice(0,1).toUpperCase()}</div><div className="post-content"><div className="post-meta"><b>{post.authorName || 'Anggota SL'}</b><span>{post.topic || 'Obrolan Umum'}</span></div><p>{post.body}</p></div></article>)}
          {postsStatus === 'ready' && visiblePosts.length === 0 && <div className="empty-state"><span><MessageCircle size={24}/></span><h3>{search ? 'Belum ada hasil pencarian' : topic !== 'Semua' ? 'Belum ada obrolan di topik ini' : 'Belum ada obrolan'}</h3><p>{search ? 'Coba kata kunci yang berbeda.' : 'Jadilah yang pertama memulai obrolan komunitas.'}</p></div>}
        </div>
      </section>}
      {authOpen && <div className="modal-backdrop" role="presentation" onClick={() => setAuthOpen(false)}><section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setAuthOpen(false)} aria-label="Tutup">×</button>
        <span className="brand-mark"><Sparkles size={20}/></span><h2 id="auth-title">{registerMode ? 'Gabung komunitas' : 'Selamat datang kembali'}</h2><p>{registerMode ? 'Buat akun untuk mulai terhubung.' : 'Masuk untuk ikut dalam percakapan.'}</p>
        <form onSubmit={handleAuth} noValidate>
          {registerMode && <label>Nama tampilan<input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={60} placeholder="Nama kamu"/></label>}
          <label>Email<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nama@email.com"/></label>
          <label>Kata sandi<input type="password" autoComplete={registerMode ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Minimal 6 karakter"/></label>
          {authError && <p className="form-error" role="alert">{authError}</p>}
          <button className="button button-dark auth-submit" type="submit" disabled={busy}>{busy ? 'Memproses…' : registerMode ? 'Buat akun' : 'Masuk'}</button>
        </form>
        <button className="switch-auth" onClick={() => { setRegisterMode(!registerMode); setAuthError(''); }}>{registerMode ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar'}</button>
      </section></div>}
      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Tutup">×</button></div>}
    </main>
    <nav className="bottom-nav" aria-label="Navigasi aplikasi">
      <button className={section === 'Beranda' ? 'bottom-nav-item active' : 'bottom-nav-item'} onClick={() => setSection('Beranda')} aria-current={section === 'Beranda' ? 'page' : undefined}><Home size={20}/><span>Beranda</span></button>
      <button className={section === 'Cari Warkop' ? 'bottom-nav-item active' : 'bottom-nav-item'} onClick={() => setSection('Cari Warkop')} aria-current={section === 'Cari Warkop' ? 'page' : undefined}><Compass size={20}/><span>Cari Warkop</span></button>
      <button className={section === 'Obrolan' ? 'bottom-nav-item active' : 'bottom-nav-item'} onClick={() => { setSection('Obrolan'); document.getElementById('community-feed')?.scrollIntoView({behavior:'smooth'}); }} aria-current={section === 'Obrolan' ? 'page' : undefined}><MessageCircle size={20}/><span>Obrolan</span></button>
      <button className={section === 'Daftarkan Warkop' ? 'bottom-nav-item active' : 'bottom-nav-item'} onClick={() => setSection('Daftarkan Warkop')} aria-current={section === 'Daftarkan Warkop' ? 'page' : undefined}><Store size={20}/><span>Daftar</span></button>
      <button className={section === 'Akun' ? 'bottom-nav-item active' : 'bottom-nav-item'} onClick={() => setSection('Akun')} aria-current={section === 'Akun' ? 'page' : undefined}><UserRound size={20}/><span>Akun</span></button>
    </nav>
    <footer><span className="footer-brand"><Sparkles size={16}/> WARKOPLINK</span><span>Ruang digital untuk saling terhubung.</span><small>© {new Date().getFullYear()} WarkopLink Platform</small></footer>
  </div>;
}