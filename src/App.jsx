import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword,
  signOut, updateProfile
} from 'firebase/auth';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, startAfter, updateDoc, where, writeBatch
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { auth, db, storage, firebaseConfigured } from './firebase.js';
import AdminPanel from './AdminPanel.jsx';
import { MessageCircle, Users, BookOpen, Sparkles, ShieldCheck, Heart, ArrowUpRight, LogOut, Home, Compass, UserRound, Download, MapPin, Store, Send, MoreHorizontal, MessageSquare, Share2 } from 'lucide-react';
import {
  FILTER_TOPICS, MAX_POST_LENGTH, POST_TOPICS, authErrorMessage, authorNameFor, filterPosts,
  postErrorMessage, validateDisplayName, validateEmail, validatePassword, validatePostBody
} from './lib.js';

const POSTS_LIMIT = 100;


function relativePostTime(value) {
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : null;
  if (!date || Number.isNaN(date.getTime())) return 'baru saja';
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'baru saja';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm lalu';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'j lalu';
  if (seconds < 604800) return Math.floor(seconds / 86400) + 'h lalu';
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

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
  const [composerOpen, setComposerOpen] = useState(false);
  const [replyingPostId, setReplyingPostId] = useState('');
  const [replyDraft, setReplyDraft] = useState('');
  const [replyCounts, setReplyCounts] = useState({});
  const [repliesByPost, setRepliesByPost] = useState({});
  const [expandedReplies, setExpandedReplies] = useState({});
  const [likedPosts, setLikedPosts] = useState({});
  const [likeCounts, setLikeCounts] = useState({});
  const [postReactions, setPostReactions] = useState({});
  const [openPostMenuId, setOpenPostMenuId] = useState('');
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
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef(null);
  const [posting, setPosting] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [reportingPostId, setReportingPostId] = useState('');
  const [reportReason, setReportReason] = useState('Spam atau promosi berulang');
  const [reporting, setReporting] = useState(false);
  const registering = useRef(false);

  useEffect(() => {
    if (!cooldownUntil) { setCooldownRemaining(0); return undefined; }
    const updateCooldown = () => {
      const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setCooldownRemaining(remaining);
      if (remaining === 0) setCooldownUntil(0);
    };
    updateCooldown();
    const timer = setInterval(updateCooldown, 250);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

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
        photoURL: currentUser.photoURL || '',
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

  // Muat pratinjau komentar untuk posting terbaru agar balasan terlihat langsung tanpa membuka panel.
  useEffect(() => {
    if (!db || !posts.length) return undefined;
    let cancelled = false;
    const loadPreviews = async () => {
      const latestPosts = posts.slice(0, 12);
      const results = await Promise.all(latestPosts.map(async (post) => {
        try {
          const snapshot = await getDocs(query(collection(db, 'posts', post.id, 'replies'), orderBy('createdAt', 'asc'), limit(4)));
          return [post.id, snapshot.docs.map((item) => ({ id: item.id, ...item.data() })), snapshot.size];
        } catch {
          return [post.id, [], 0];
        }
      }));
      if (cancelled) return;
      setRepliesByPost(current => ({ ...current, ...Object.fromEntries(results.map(([id, replies]) => [id, replies])) }));
      setReplyCounts(current => ({ ...current, ...Object.fromEntries(results.map(([id, , count]) => [id, count])) }));
    };
    loadPreviews();
    return () => { cancelled = true; };
  }, [posts]);

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
      // Postingan dan penanda cooldown ditulis atomik; Firestore Rules menegakkan jeda 10 detik.
      const postRef = doc(collection(db, 'posts'));
      const rateLimitRef = doc(db, 'postRateLimits', user.uid);
      const batch = writeBatch(db);
      batch.set(postRef, {
        authorId: user.uid,
        authorName: authorNameFor(user),
        authorPhotoURL: user.photoURL || null,
        body: bodyCheck.value,
        topic: topic === 'Semua' ? 'Obrolan Umum' : topic,
        createdAt: serverTimestamp()
      });
      batch.set(rateLimitRef, { uid: user.uid, lastSentAt: serverTimestamp() });
      await batch.commit();
      setDraft('');
      setCooldownUntil(Date.now() + 10000);
      setNotice('Obrolan berhasil dipublikasikan. Tunggu 10 detik sebelum mengirim pesan berikutnya.');
    } catch (error) {
      setNotice(postErrorMessage(error));
    } finally {
      setPosting(false);
    }
  }

  async function handleReactPost(post, emoji) {
    if (!user) { openAuth(false); setNotice('Masuk terlebih dahulu untuk bereaksi pada status.'); return; }
    if (!db || !post?.id) return;
    const reactionRef = doc(db, 'posts', post.id, 'likes', user.uid);
    try {
      const existing = await getDoc(reactionRef);
      if (existing.exists() && (existing.data().emoji || '❤️') === emoji) {
        await deleteDoc(reactionRef);
        setLikedPosts(current => ({ ...current, [post.id]: false }));
        setPostReactions(current => ({ ...current, [post.id]: '' }));
        setLikeCounts(current => ({ ...current, [post.id]: Math.max(0, (current[post.id] || 1) - 1) }));
      } else if (existing.exists()) {
        await updateDoc(reactionRef, { emoji });
        setLikedPosts(current => ({ ...current, [post.id]: true }));
        setPostReactions(current => ({ ...current, [post.id]: emoji }));
      } else {
        await setDoc(reactionRef, { uid: user.uid, emoji, createdAt: serverTimestamp() });
        setLikedPosts(current => ({ ...current, [post.id]: true }));
        setPostReactions(current => ({ ...current, [post.id]: emoji }));
        setLikeCounts(current => ({ ...current, [post.id]: (current[post.id] || 0) + 1 }));
      }
    } catch (error) {
      setNotice(error?.code === 'permission-denied' ? 'Reaksi ditolak oleh aturan keamanan.' : 'Reaksi belum tersimpan. Coba lagi.');
    }
  }

  async function handleLikePost(post) {
    return handleReactPost(post, '❤️');
  }

  async function openReplies(post) {
    if (!user) { openAuth(false); setNotice('Masuk terlebih dahulu untuk membalas obrolan.'); return; }
    setReplyingPostId(current => current === post.id ? '' : post.id);
    setReplyDraft('');
    if (!db || !post?.id) return;
    try {
      const snapshot = await getDocs(query(collection(db, 'posts', post.id, 'replies'), orderBy('createdAt', 'asc'), limit(50)));
      const replies = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      setRepliesByPost(current => ({ ...current, [post.id]: replies }));
      setExpandedReplies(current => ({ ...current, [post.id]: true }));
      setReplyCounts(current => ({ ...current, [post.id]: snapshot.size }));
    } catch {
      setNotice('Balasan belum dapat dimuat. Coba lagi sebentar lagi.');
    }
  }

  async function handleReply(event, post) {
    event.preventDefault();
    if (!user) { openAuth(false); return; }
    const body = replyDraft.trim();
    if (!body || body.length > 1000) { setNotice('Balasan harus berisi 1–1000 karakter.'); return; }
    try {
      await addDoc(collection(db, 'posts', post.id, 'replies'), {
        authorId: user.uid, authorName: authorNameFor(user), authorPhotoURL: user.photoURL || null, body, createdAt: serverTimestamp()
      });
      setReplyDraft('');
      setReplyingPostId('');
      setReplyCounts(current => ({ ...current, [post.id]: (current[post.id] || 0) + 1 }));
      setRepliesByPost(current => ({ ...current, [post.id]: [...(current[post.id] || []), { id: `local-${Date.now()}`, authorId: user.uid, authorName: authorNameFor(user), authorPhotoURL: user.photoURL || null, body, createdAt: null }] }));
      setNotice('Balasan berhasil dikirim.');
    } catch (error) {
      setNotice(error?.code === 'permission-denied' ? 'Balasan ditolak oleh aturan keamanan.' : 'Balasan belum terkirim. Coba lagi.');
    }
  }

  async function sharePost(post) {
    const shareUrl = `${window.location.origin}/#community-feed`;
    const shareText = `${post.body || ''}\n\nLihat obrolan dan gabung di WarkopLink:\n${shareUrl}`;
    const shareData = { title: 'Obrolan WarkopLink', text: shareText };
    try {
      if (navigator.share) await navigator.share(shareData);
      else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        setNotice('Kalimat obrolan dan tautan WarkopLink berhasil disalin.');
      } else setNotice('Fitur berbagi tidak tersedia di browser ini.');
    } catch (error) {
      if (error?.name !== 'AbortError') setNotice('Obrolan belum dapat dibagikan.');
    }
  }

  async function handleReportPost(event, post) {
    event.preventDefault();
    if (!user) { openAuth(false); setNotice('Masuk terlebih dahulu untuk melaporkan obrolan.'); return; }
    const allowedReasons = ['Spam atau promosi berulang', 'Pelecehan atau ujaran kebencian', 'Informasi berbahaya atau menyesatkan', 'Lainnya'];
    if (!db || !post?.id || !allowedReasons.includes(reportReason)) { setNotice('Laporan belum dapat dikirim. Periksa pilihan alasan lalu coba lagi.'); return; }
    setReporting(true);
    try {
      await setDoc(doc(db, 'postReports', `${post.id}_${user.uid}`), {
        targetPostId: post.id, targetAuthorId: post.authorId, reporterUid: user.uid,
        reason: reportReason, createdAt: serverTimestamp()
      });
      setReportingPostId('');
      setReportReason('Spam atau promosi berulang');
      setNotice('Laporan terkirim kepada admin untuk ditinjau.');
    } catch (error) {
      setNotice(error?.code === 'permission-denied' ? 'Laporan ditolak oleh aturan keamanan. Pastikan Anda sudah masuk.' : 'Laporan belum berhasil dikirim. Periksa koneksi lalu coba lagi.');
    } finally { setReporting(false); }
  }

  async function handleProfilePhotoChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !user || !db || !storage) {
      if (file) setNotice('Unggah foto belum tersedia. Pastikan Firebase Storage aktif.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setNotice('Pilih foto JPG, PNG, atau WebP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setNotice('Ukuran foto maksimal 2 MB.');
      return;
    }
    setPhotoUploading(true);
    try {
      const hasProfile = await ensureProfile(user);
      if (!hasProfile) throw new Error('profile-not-ready');
      const photoRef = storageRef(storage, `profilePhotos/${user.uid}/avatar`);
      await uploadBytes(photoRef, file, { contentType: file.type });
      const photoURL = await getDownloadURL(photoRef);
      await updateProfile(user, { photoURL });
      await updateDoc(doc(db, 'profiles', user.uid), { photoURL, updatedAt: serverTimestamp() });
      setUser({ ...auth.currentUser });
      setNotice('Foto profil berhasil diperbarui.');
    } catch (error) {
      console.warn('Unggah foto profil gagal:', error?.code || 'unknown');
      setNotice(error?.code === 'storage/unauthorized'
        ? 'Unggah ditolak aturan keamanan Firebase Storage.'
        : 'Foto profil belum berhasil disimpan. Pastikan Firebase Storage sudah diaktifkan.');
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleRemoveProfilePhoto() {
    if (!user || !db || !storage || !user.photoURL) return;
    setPhotoUploading(true);
    try {
      await deleteObject(storageRef(storage, `profilePhotos/${user.uid}/avatar`)).catch((error) => {
        if (error?.code !== 'storage/object-not-found') throw error;
      });
      await updateProfile(user, { photoURL: null });
      await updateDoc(doc(db, 'profiles', user.uid), { photoURL: '', updatedAt: serverTimestamp() });
      setUser({ ...auth.currentUser });
      setNotice('Foto profil dihapus.');
    } catch (error) {
      console.warn('Hapus foto profil gagal:', error?.code || 'unknown');
      setNotice('Foto profil belum dapat dihapus. Coba lagi.');
    } finally {
      setPhotoUploading(false);
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
  const activeCategory = topic === 'Semua' ? 'Obrolan Umum' : topic;

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
        {user ? <><article className="account-card"><div className="account-avatar">{user.photoURL ? <img src={user.photoURL} alt="Foto profil" /> : String(user.displayName || user.email || 'A').slice(0,1).toUpperCase()}</div><div className="account-details"><b>{user.displayName || 'Anggota SL'}</b><p>{user.email}</p><small>Akun Anda siap untuk ikut berdiskusi.</small><div className="profile-photo-actions"><input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleProfilePhotoChange} /><button className="button button-quiet" type="button" onClick={() => photoInputRef.current?.click()} disabled={photoUploading}>{photoUploading ? 'Memproses foto…' : user.photoURL ? 'Ganti foto' : 'Unggah foto profil'}</button>{user.photoURL && <button className="button button-quiet" type="button" onClick={handleRemoveProfilePhoto} disabled={photoUploading}>Hapus foto</button>}</div><small>JPG, PNG, atau WebP · maksimal 2 MB.</small></div><button className="button button-dark" onClick={handleSignOut}><LogOut size={15}/> Keluar</button></article>{isAdmin && <button className="button button-dark admin-entry-button" onClick={() => setSection('Panel Admin')}><ShieldCheck size={16}/> Buka Panel Admin</button>}</> :
          <article className="account-card"><div className="account-avatar"><UserRound size={25}/></div><div><b>Gabung bersama komunitas</b><p>Buat akun untuk memulai obrolan dan berbagi pengalaman.</p></div><button className="button button-dark" onClick={() => openAuth(true)}>Daftar</button></article>}
      </section> :
      section === 'Tentang' ? <section className="content-section"><span className="eyebrow">TENTANG WARKOPLINK</span><h2>Temukan warkop, kenali lingkungan, terhubung.</h2><p>WarkopLink membantu warga menemukan dan mengenal warkop di Kabupaten Lamongan. Pendaftaran tetap gratis.</p></section> :
      (section === 'Cari Warkop' || section === 'Daftarkan Warkop') ? <WarungDirectory mode={section === 'Cari Warkop' ? 'directory' : 'register'} user={user} db={db} onRequestAuth={() => openAuth(false)} onNotice={setNotice}/> :
      (section === 'Layanan' || section === 'Jelajahi') ? <section className="content-section explore-section"><span className="eyebrow">JELAJAHI</span><h2>Temukan komunitas lokal.</h2><p>Temukan informasi lokal dan mulai percakapan yang bermanfaat.</p><div className="service-grid"><article><MapPin size={24}/><h3>Wilayah awal: Lamongan</h3><p>Fokus pada Kabupaten Lamongan, lalu diperluas bertahap.</p></article><article><Store size={24}/><h3>Pendaftaran gratis</h3><p>Tidak ada biaya untuk mendaftarkan warkop pada tahap awal.</p></article><article><ShieldCheck size={24}/><h3>Verifikasi bertahap</h3><p>Status verifikasi dan hak pemilik harus dikendalikan secara aman.</p></article></div><button className="button button-dark" onClick={() => setSection('Cari Warkop')}>Cari warkop</button></section> :
      <section className="content-section" id="community-feed">
        <div className="section-heading"><div><span className="eyebrow">RUANG BERSAMA</span><h2>Obrolan komunitas</h2><p>Satu percakapan bisa jadi awal dari hal baik.</p></div><span className="status-pill">{user ? 'Masuk sebagai ' + (user.displayName || user.email) : 'Baca obrolan publik'}</span></div>
        {!firebaseConfigured && <p className="config-warning">Firebase belum tersambung. Kode integrasi siap; konfigurasi proyek diperlukan untuk mengaktifkan akun dan database.</p>}
        <div className="feed-tools"><label className="search"><span>⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Cari di ${topic === 'Semua' ? 'semua obrolan' : topic}…`} aria-label={`Cari di ${topic === 'Semua' ? 'semua obrolan' : topic}`}/></label></div>
        <div className="topic-scroll-wrap"><div className="topic-list" aria-label="Kategori obrolan">{FILTER_TOPICS.map(t => <button key={t} onClick={() => setTopic(t)} aria-pressed={topic === t} className={topic === t ? 'topic selected' : 'topic'}>{t}</button>)}</div><span className="topic-scroll-hint" aria-hidden="true">›</span></div>
        <form className={composerOpen ? 'composer composer-expanded' : 'composer composer-collapsed'} onSubmit={handlePost}>
          {!composerOpen ? <button type="button" className="composer-trigger" onClick={() => { if (!user) { openAuth(false); setNotice('Masuk untuk mulai berbagi obrolan.'); return; } setComposerOpen(true); }}><span className="composer-avatar">{user?.photoURL ? <img src={user.photoURL} alt="" /> : String(user?.displayName || user?.email || 'S').slice(0,1).toUpperCase()}</span><span>{user ? 'Ayo ngobrol…' : 'Masuk untuk mulai ngobrol…'}</span></button> : <>
            <div className="composer-context"><span className="composer-avatar">{user?.photoURL ? <img src={user.photoURL} alt="" /> : String(user?.displayName || user?.email || 'S').slice(0,1).toUpperCase()}</span><div><b>{user?.displayName || 'Anggota komunitas'}</b><small>Posting ke <strong>{activeCategory}</strong></small></div></div>
            <textarea aria-label="Isi obrolan" autoFocus value={draft} onChange={e => setDraft(e.target.value)} maxLength={MAX_POST_LENGTH} placeholder="Ayo ngobrol…" rows={3}/>
            <div className="composer-bottom"><small className="char-count" aria-live="polite">{draft.length}/{MAX_POST_LENGTH}</small><button className="button button-quiet" type="button" onClick={() => { setComposerOpen(false); setDraft(''); }}>Batal</button><button className="button button-dark" type="submit" disabled={posting || cooldownRemaining > 0 || !draft.trim()}>{posting ? 'Mengirim…' : cooldownRemaining > 0 ? `Tunggu ${cooldownRemaining} dtk` : 'Kirim'} <Send size={16}/></button></div>
          </>}
        </form>
        <div className="post-list">
          {postsStatus === 'loading' && <div className="empty-state" role="status"><h3>Memuat obrolan…</h3><p>Mohon tunggu sebentar.</p></div>}
          {postsStatus === 'error' && <div className="empty-state" role="alert"><h3>Obrolan belum dapat dimuat</h3><p>Periksa koneksi internet Anda lalu coba lagi.</p><button className="button button-dark" onClick={() => setPostsRetry(n => n + 1)}>Coba lagi</button></div>}
          {postsStatus === 'ready' && visiblePosts.map(post => <article className="post-card" key={post.id}>
            <div className="post-avatar">{post.authorPhotoURL ? <img src={post.authorPhotoURL} alt="" loading="lazy" /> : String(post.authorName || 'A').slice(0,1).toUpperCase()}</div>
            <div className="post-content">
              <div className="post-head"><div className="post-meta"><b>{post.authorName || 'Anggota SL'}</b><span>{post.topic || 'Obrolan Umum'}</span><small title={post.createdAt?.toDate?.()?.toLocaleString('id-ID') || ''}>{relativePostTime(post.createdAt)}</small></div>
                <div className="post-menu-wrap"><button className="post-menu-trigger" type="button" aria-label="Opsi postingan" aria-expanded={openPostMenuId === post.id} onClick={() => setOpenPostMenuId(current => current === post.id ? '' : post.id)}><MoreHorizontal size={20}/></button>
                  {openPostMenuId === post.id && <div className="post-menu"><button type="button" onClick={() => { setOpenPostMenuId(''); if (!user) { openAuth(false); setNotice('Masuk terlebih dahulu untuk melaporkan obrolan.'); return; } setReportingPostId(current => current === post.id ? '' : post.id); setReportReason('Spam atau promosi berulang'); }}>⚑ Laporkan obrolan</button><button type="button" onClick={() => { setOpenPostMenuId(''); sharePost(post); }}><Share2 size={14}/> Bagikan</button></div>}
                </div>
              </div>
              <p>{post.body}</p>
              <div className="status-reactions" role="group" aria-label="Reaksi pada status">
                {['👍', '❤️', '😂', '😮', '😢', '😡'].map(emoji => <button key={emoji} type="button" className={postReactions[post.id] === emoji ? 'status-reaction selected' : 'status-reaction'} aria-label={`Beri reaksi ${emoji}`} aria-pressed={postReactions[post.id] === emoji} onClick={() => handleReactPost(post, emoji)}>{emoji}</button>)}
              </div>
              <div className="engagement-summary"><span>{(likeCounts[post.id] || 0) > 0 ? `❤️ ${likeCounts[post.id]}` : ''}</span><span>{(replyCounts[post.id] || 0) > 0 ? `${replyCounts[post.id] >= 4 && !expandedReplies[post.id] ? '3+' : replyCounts[post.id]} komentar` : ''}</span></div>
              <div className="post-actions">
                <button className={likedPosts[post.id] ? 'post-action liked' : 'post-action'} type="button" onClick={() => handleLikePost(post)}><Heart size={17} fill={likedPosts[post.id] ? 'currentColor' : 'none'}/> <span>Suka</span></button>
                <button className="post-action" type="button" onClick={() => openReplies(post)}><MessageSquare size={17}/> <span>Balas</span></button>
                <button className="post-action" type="button" onClick={() => sharePost(post)}><Share2 size={17}/> <span>Bagikan</span></button>
              </div>
              {(repliesByPost[post.id] || []).length > 0 && <div className="inline-replies" aria-label="Komentar dan balasan">
                {(expandedReplies[post.id] ? repliesByPost[post.id] : repliesByPost[post.id].slice(0, 3)).map(reply => <div className="inline-reply" key={reply.id}>
                  <div className="inline-reply-avatar">{reply.authorPhotoURL ? <img src={reply.authorPhotoURL} alt="" loading="lazy"/> : String(reply.authorName || 'A').slice(0, 1).toUpperCase()}</div>
                  <div className="inline-reply-body"><b>{reply.authorName || 'Anggota komunitas'}</b><p>{reply.body}</p><small>{reply.createdAt?.toDate?.() ? relativePostTime(reply.createdAt) : 'Baru saja'}</small></div>
                </div>)}
                {(repliesByPost[post.id].length >= 4 || (replyCounts[post.id] || 0) > 3) && !expandedReplies[post.id] && <button className="show-more-replies" type="button" onClick={() => openReplies(post)}>Lihat semua komentar</button>}
              </div>}
              {replyingPostId === post.id && <form className="reply-form" onSubmit={event => handleReply(event, post)}><input aria-label="Tulis balasan" value={replyDraft} onChange={event => setReplyDraft(event.target.value)} maxLength={1000} placeholder="Tulis komentar atau balasan…"/><button className="button button-dark" type="submit" disabled={!replyDraft.trim()} aria-label="Kirim komentar"><Send size={15}/></button></form>}
              {reportingPostId === post.id && <form className="report-form" onSubmit={event => handleReportPost(event, post)}><label>Alasan laporan<select aria-label="Alasan laporan" value={reportReason} onChange={event => setReportReason(event.target.value)}><option>Spam atau promosi berulang</option><option>Pelecehan atau ujaran kebencian</option><option>Informasi berbahaya atau menyesatkan</option><option>Lainnya</option></select></label><div className="report-form-actions"><button className="button button-dark" type="submit" disabled={reporting}>{reporting ? 'Mengirim laporan…' : 'Kirim laporan'}</button><button className="button button-quiet" type="button" onClick={() => setReportingPostId('')} disabled={reporting}>Batal</button></div></form>}
            </div></article>)}
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