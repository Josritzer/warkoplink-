import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EMPTY_REACTIONS, reactionFieldForEmoji, shouldRemoveReaction, summarizeReactions } from './reactions.js';
import {
  createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword,
  signOut, updateProfile
} from 'firebase/auth';
import {
  addDoc, collection, deleteDoc, doc, getCountFromServer, getDoc, getDocs, increment, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, startAfter, Timestamp, updateDoc, where
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { auth, db, storage, firebaseConfigured } from './firebase.js';
import AdminPanel from './AdminPanel.jsx';
import ChatPanel from './chat/ChatPanel.jsx';
import { relativePostTime } from './chat/postTime.js';
import { deleteOwnPost } from './services/postService.js';
import { MessageCircle, Users, BookOpen, Sparkles, ShieldCheck, Heart, ArrowUpRight, LogOut, Home, Compass, UserRound, Download, MapPin, Store, Send, MoreHorizontal, MessageSquare, Share2 } from 'lucide-react';
import {
  FILTER_TOPICS, MAX_POST_LENGTH, POST_TOPICS, authErrorMessage, authorNameFor, filterPosts,
  postErrorMessage, validateDisplayName, validateEmail, validatePassword, validatePostBody
} from './lib.js';

const POSTS_LIMIT = 10;
const FEED_CACHE_KEY = 'warkoplink:community-feed:v1';

function readCachedPosts() {
  try {
    const cached = JSON.parse(window.localStorage.getItem(FEED_CACHE_KEY) || '[]');
    if (!Array.isArray(cached)) return [];
    return cached.slice(0, POSTS_LIMIT).map((post) => ({
      ...post,
      createdAt: post.createdAt?.seconds != null
        ? Timestamp.fromMillis(post.createdAt.seconds * 1000 + (post.createdAt.nanoseconds || 0) / 1e6)
        : post.createdAt
    }));
  } catch {
    return [];
  }
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
  const [selectedReplyPost, setSelectedReplyPost] = useState(null);
  const [replyPageLoading, setReplyPageLoading] = useState(false);
  const [replyDraft, setReplyDraft] = useState('');
  const [replyCounts, setReplyCounts] = useState({});
  const [repliesByPost, setRepliesByPost] = useState({});
  const [replyCursorByPost, setReplyCursorByPost] = useState({});
  const [hasMoreRepliesByPost, setHasMoreRepliesByPost] = useState({});
  const [loadingMoreRepliesPostId, setLoadingMoreRepliesPostId] = useState('');
  const [replyTarget, setReplyTarget] = useState(null);
  const [commentReactionSummaries, setCommentReactionSummaries] = useState({});
  const [commentActionBusyId, setCommentActionBusyId] = useState('');
  const [openCommentMenuId, setOpenCommentMenuId] = useState('');
  const [expandedReplies, setExpandedReplies] = useState({});
  const [likedPosts, setLikedPosts] = useState({});
  const [likeCounts, setLikeCounts] = useState({});
  const [postReactions, setPostReactions] = useState({});
  const [reactionSummaries, setReactionSummaries] = useState({});
  const [openPostMenuId, setOpenPostMenuId] = useState('');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [installPrompt, setInstallPrompt] = useState(null);
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authReady, setAuthReady] = useState(!auth);
  const [posts, setPosts] = useState(readCachedPosts);
  const [olderPosts, setOlderPosts] = useState([]);
  const [lastPostDoc, setLastPostDoc] = useState(null);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState('');
  const [postsStatus, setPostsStatus] = useState(() => db ? (readCachedPosts().length ? 'ready' : 'loading') : 'ready');
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
  const [reportingPostId, setReportingPostId] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState('');
  const [deletingPostId, setDeletingPostId] = useState('');
  const [reportReason, setReportReason] = useState('Spam atau promosi berulang');
  const [reporting, setReporting] = useState(false);
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
    setPostsStatus(current => current === 'ready' && posts.length ? current : 'loading');
    setOlderPosts([]);
    setLastPostDoc(null);
    setHasMorePosts(false);
    setLoadMoreError('');
    const postsQuery = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(POSTS_LIMIT));
    return onSnapshot(postsQuery, (snapshot) => {
      const nextPosts = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      setPosts(nextPosts);
      setLastPostDoc(snapshot.docs.at(-1) || null);
      setHasMorePosts(snapshot.docs.length === POSTS_LIMIT);
      setPostsStatus('ready');
      try {
        window.localStorage.setItem(FEED_CACHE_KEY, JSON.stringify(nextPosts.slice(0, POSTS_LIMIT)));
      } catch {
        // Cache opsional; feed tetap berjalan jika penyimpanan penuh/nonaktif.
      }
    }, () => setPostsStatus(current => current === 'ready' && posts.length ? current : 'error'));
  }, [postsRetry]);

  const allPosts = useMemo(() => {
    const unique = new Map();
    [...posts, ...olderPosts].forEach((post) => { if (!unique.has(post.id)) unique.set(post.id, post); });
    return [...unique.values()];
  }, [posts, olderPosts]);

  async function loadMorePosts() {
    if (!db || !lastPostDoc || loadingMorePosts || !hasMorePosts) return;
    setLoadingMorePosts(true);
    setLoadMoreError('');
    try {
      const nextQuery = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), startAfter(lastPostDoc), limit(POSTS_LIMIT));
      const snapshot = await getDocs(nextQuery);
      const nextRows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      setOlderPosts((current) => {
        const seen = new Set([...posts, ...current].map((post) => post.id));
        return [...current, ...nextRows.filter((post) => !seen.has(post.id))];
      });
      setLastPostDoc(snapshot.docs.at(-1) || lastPostDoc);
      setHasMorePosts(snapshot.docs.length === POSTS_LIMIT);
    } catch {
      setLoadMoreError('Belum bisa memuat obrolan lama. Periksa koneksi lalu coba lagi.');
    } finally {
      setLoadingMorePosts(false);
    }
  }

  // Reaksi berasal dari Firestore agar pulih setelah refresh dan sinkron antarpengguna.
  useEffect(() => {
    if (!db || !allPosts.length) return undefined;
    let active = true;
    const unsubscribers = allPosts.map((post) => onSnapshot(
      collection(db, 'posts', post.id, 'likes'),
      (snapshot) => {
        if (!active) return;
        const summary = summarizeReactions(snapshot.docs, user?.uid || '');
        setLikeCounts((current) => ({ ...current, [post.id]: summary.totalReactions }));
        setLikedPosts((current) => ({ ...current, [post.id]: summary.liked }));
        setPostReactions((current) => ({ ...current, [post.id]: summary.emoji }));
        setReactionSummaries((current) => ({ ...current, [post.id]: { reactions: summary.reactions, totalReactions: summary.totalReactions } }));
      },
      () => {
        if (active) setNotice('Reaksi belum dapat dimuat. Periksa koneksi lalu coba lagi.');
      }
    ));
    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [allPosts, user?.uid]);

  // Ambil angka komentar saja; isi komentar baru dimuat saat pengguna membuka panel.
  useEffect(() => {
    if (!db || !allPosts.length) return undefined;
    let cancelled = false;
    Promise.all(allPosts.map(async (post) => {
      try {
        const count = await getCountFromServer(collection(db, 'posts', post.id, 'replies'));
        return [post.id, count.data().count];
      } catch {
        return [post.id, null];
      }
    })).then((results) => {
      if (cancelled) return;
      setReplyCounts((current) => {
        const next = { ...current };
        results.forEach(([id, serverCount]) => {
          if (serverCount !== null) {
            const pendingCount = (repliesByPost[id] || []).filter((reply) => reply.pending).length;
            next[id] = serverCount + pendingCount;
          }
        });
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [allPosts]);
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
      const postRef = doc(collection(db, 'posts'));
      await setDoc(postRef, {
        authorId: user.uid,
        authorName: authorNameFor(user),
        authorPhotoURL: user.photoURL || null,
        body: bodyCheck.value,
        topic: topic === 'Semua' ? 'Obrolan Umum' : topic,
        createdAt: serverTimestamp(),
        reactions: { ...EMPTY_REACTIONS },
        totalReactions: 0
      });
      setDraft('');
      setNotice('Obrolan berhasil dipublikasikan.');
    } catch (error) {
      setNotice(postErrorMessage(error));
    } finally {
      setPosting(false);
    }
  }

  async function handleDeletePost(post) {
    if (!user || !db || !post?.id || post.authorId !== user.uid || deletingPostId) return;
    setDeletingPostId(post.id);
    try {
      await deleteOwnPost(db, post.id);
      setDeleteConfirmId('');
      setOpenPostMenuId('');
      setNotice('Obrolan Anda berhasil dihapus.');
    } catch (error) {
      setNotice(error?.code === 'permission-denied'
        ? 'Penghapusan ditolak oleh aturan keamanan. Hanya pemilik obrolan yang dapat menghapusnya.'
        : 'Obrolan belum dapat dihapus. Periksa koneksi lalu coba lagi.');
    } finally {
      setDeletingPostId('');
    }
  }

  async function handleReactPost(post, emoji) {
    if (!user) { openAuth(false); setNotice('Masuk terlebih dahulu untuk bereaksi pada status.'); return; }
    if (!db || !post?.id || !reactionFieldForEmoji(emoji)) return;

    const postId = post.id;
    const field = reactionFieldForEmoji(emoji);
    const previous = {
      count: likeCounts[postId] ?? post.totalReactions ?? 0,
      liked: Boolean(likedPosts[postId]),
      emoji: postReactions[postId] || '',
      summary: reactionSummaries[postId] || {
        reactions: { ...(post.reactions || EMPTY_REACTIONS) },
        totalReactions: likeCounts[postId] ?? post.totalReactions ?? 0
      }
    };
    const nextReactions = { ...EMPTY_REACTIONS, ...previous.summary.reactions };
    const removing = previous.liked && previous.emoji === emoji;
    const previousField = previous.liked ? (reactionFieldForEmoji(previous.emoji) || 'like') : '';

    if (removing) {
      nextReactions[field] = Math.max(0, (nextReactions[field] || 0) - 1);
    } else {
      if (previous.liked && previousField) {
        nextReactions[previousField] = Math.max(0, (nextReactions[previousField] || 0) - 1);
      }
      nextReactions[field] = (nextReactions[field] || 0) + 1;
    }
    const nextTotal = Math.max(0, previous.summary.totalReactions + (removing ? -1 : previous.liked ? 0 : 1));
    const optimistic = { reactions: nextReactions, totalReactions: nextTotal };

    // Optimistic update: ringkasan berubah sebelum transaksi Firestore selesai.
    setReactionSummaries(current => ({ ...current, [postId]: optimistic }));
    setLikeCounts(current => ({ ...current, [postId]: nextTotal }));
    setLikedPosts(current => ({ ...current, [postId]: !removing }));
    setPostReactions(current => ({ ...current, [postId]: removing ? '' : emoji }));

    const postRef = doc(db, 'posts', postId);
    const reactionRef = doc(db, 'posts', postId, 'likes', user.uid);
    try {
      await runTransaction(db, async (transaction) => {
        const [reactionSnapshot, postSnapshot] = await Promise.all([
          transaction.get(reactionRef),
          transaction.get(postRef)
        ]);
        if (!postSnapshot.exists()) throw new Error('post-not-found');

        const existingData = reactionSnapshot.exists() ? reactionSnapshot.data() : null;
        const postData = postSnapshot.data();
        const oldEmoji = typeof existingData?.emoji === 'string' ? existingData.emoji : '';
        const removeExisting = shouldRemoveReaction(existingData, emoji);
        const hasAggregate = postData.reactions
          && typeof postData.totalReactions === 'number'
          && Object.keys(EMPTY_REACTIONS).every(key => typeof postData.reactions[key] === 'number');

        if (removeExisting) {
          transaction.delete(reactionRef);
          if (hasAggregate) {
            transaction.update(postRef, {
              [`reactions.${field}`]: increment(-1),
              totalReactions: increment(-1)
            });
          }
          return;
        }

        if (reactionSnapshot.exists()) {
          transaction.update(reactionRef, { emoji });
        } else {
          transaction.set(reactionRef, { uid: user.uid, emoji, createdAt: serverTimestamp() });
        }

        if (hasAggregate) {
          const updates = {
            [`reactions.${field}`]: increment(1)
          };
          if (reactionSnapshot.exists()) {
            // A legacy like has no emoji field, but is represented in the 👍 bucket.
            const oldField = reactionFieldForEmoji(oldEmoji) || 'like';
            if (oldField !== field) updates[`reactions.${oldField}`] = increment(-1);
          } else {
            updates.totalReactions = increment(1);
          }
          transaction.update(postRef, updates);
        }
      });
    } catch (error) {
      setReactionSummaries(current => ({ ...current, [postId]: previous.summary }));
      setLikeCounts(current => ({ ...current, [postId]: previous.count }));
      setLikedPosts(current => ({ ...current, [postId]: previous.liked }));
      setPostReactions(current => ({ ...current, [postId]: previous.emoji }));
      setNotice(error?.code === 'permission-denied'
        ? 'Reaksi ditolak oleh aturan keamanan.'
        : 'Reaksi belum tersimpan. Coba lagi.');
    }
  }

  async function handleLikePost(post) {
    return handleReactPost(post, '❤️');
  }

  async function openReplies(post) {
    if (!db || !post?.id) return [];
    setReplyingPostId(post.id);
    setReplyDraft('');
    setReplyTarget(null);
    try {
      // Muat komentar terbaru; tombol pagination mengambil komentar yang lebih lama.
      const [snapshot, countSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'posts', post.id, 'replies'), orderBy('createdAt', 'desc'), limit(10))),
        getCountFromServer(collection(db, 'posts', post.id, 'replies'))
      ]);
      const replies = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).reverse();
      void loadCommentReactionSummaries(post, replies);
      setReplyCursorByPost(current => ({ ...current, [post.id]: snapshot.docs.at(-1) || null }));
      setHasMoreRepliesByPost(current => ({ ...current, [post.id]: snapshot.size === 10 }));
      setRepliesByPost(current => {
        const pending = (current[post.id] || []).filter(reply => reply.pending);
        const ids = new Set(replies.map(reply => reply.id));
        return { ...current, [post.id]: [...replies, ...pending.filter(reply => !ids.has(reply.id))] };
      });
      setReplyCounts(current => {
        const pendingCount = (repliesByPost[post.id] || []).filter(reply => reply.pending).length;
        return { ...current, [post.id]: countSnapshot.data().count + pendingCount };
      });
      return replies;
    } catch {
      setNotice('Komentar belum dapat dimuat. Coba lagi sebentar lagi.');
      return [];
    }
  }

  async function loadCommentReactionSummaries(post, replies) {
    if (!db || !post?.id || !replies.length) return;
    try {
      const entries = await Promise.all(replies.filter(reply => !reply.pending).map(async reply => {
        const path = collection(db, 'posts', post.id, 'replies', reply.id, 'reactions');
        const [count, mine] = await Promise.all([
          getCountFromServer(path),
          user?.uid ? getDoc(doc(db, 'posts', post.id, 'replies', reply.id, 'reactions', user.uid)) : Promise.resolve(null)
        ]);
        return [reply.id, { count: count.data().count, mine: Boolean(mine?.exists()) }];
      }));
      setCommentReactionSummaries(current => ({ ...current, ...Object.fromEntries(entries) }));
    } catch { /* Ringkasan dapat dimuat kembali saat pengguna berinteraksi. */ }
  }

  async function loadMoreReplies(post) {
    if (!db || !post?.id || !replyCursorByPost[post.id] || loadingMoreRepliesPostId) return;
    setLoadingMoreRepliesPostId(post.id);
    try {
      const snapshot = await getDocs(query(collection(db, 'posts', post.id, 'replies'),
        orderBy('createdAt', 'desc'), startAfter(replyCursorByPost[post.id]), limit(10)));
      const older = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).reverse();
      void loadCommentReactionSummaries(post, older);
      setReplyCursorByPost(current => ({ ...current, [post.id]: snapshot.docs.at(-1) || current[post.id] }));
      setHasMoreRepliesByPost(current => ({ ...current, [post.id]: snapshot.size === 10 }));
      setRepliesByPost(current => {
        const existing = current[post.id] || [];
        const ids = new Set(existing.map(reply => reply.id));
        return { ...current, [post.id]: [...older.filter(reply => !ids.has(reply.id)), ...existing] };
      });
    } catch {
      setNotice('Komentar lama belum dapat dimuat. Coba lagi.');
    } finally {
      setLoadingMoreRepliesPostId('');
    }
  }

  async function handleCommentReaction(post, reply) {
    if (!user) { openAuth(false); setNotice('Masuk terlebih dahulu untuk bereaksi pada komentar.'); return; }
    if (!db || !post?.id || !reply?.id || reply.pending || reply.deleted) return;
    const reactionRef = doc(db, 'posts', post.id, 'replies', reply.id, 'reactions', user.uid);
    setCommentActionBusyId(reply.id);
    try {
      const existing = await getDoc(reactionRef);
      if (existing.exists()) await deleteDoc(reactionRef);
      else await setDoc(reactionRef, { uid: user.uid, emoji: '👍', createdAt: serverTimestamp() });
      const [count, mine] = await Promise.all([
        getCountFromServer(collection(db, 'posts', post.id, 'replies', reply.id, 'reactions')),
        getDoc(reactionRef)
      ]);
      setCommentReactionSummaries(current => ({ ...current, [reply.id]: { count: count.data().count, mine: mine.exists() } }));
    } catch (error) {
      setNotice(error?.code === 'permission-denied' ? 'Reaksi komentar ditolak oleh aturan keamanan.' : 'Reaksi komentar belum tersimpan. Coba lagi.');
    } finally { setCommentActionBusyId(''); }
  }

  async function handleDeleteReply(post, reply) {
    if (!user || !db || !post?.id || !reply?.id || reply.pending || reply.authorId !== user.uid || reply.deleted || commentActionBusyId) return;
    setCommentActionBusyId(reply.id);
    try {
      // Soft-delete menjaga identitas komentar induk pada percakapan bertingkat.
      await updateDoc(doc(db, 'posts', post.id, 'replies', reply.id), { body: 'Komentar ini telah dihapus.', deleted: true });
      setRepliesByPost(current => ({ ...current, [post.id]: (current[post.id] || []).map(item =>
        item.id === reply.id ? { ...item, body: 'Komentar ini telah dihapus.', deleted: true } : item) }));
      setNotice('Komentar dihapus.');
    } catch (error) {
      setNotice(error?.code === 'permission-denied' ? 'Penghapusan komentar ditolak oleh aturan keamanan.' : 'Komentar belum dapat dihapus. Coba lagi.');
    } finally { setCommentActionBusyId(''); }
  }

  function closeReplies(post) {
    if (!post?.id) return;
    setReplyingPostId(current => current === post.id ? '' : current);
    setReplyDraft('');
    setReplyTarget(null);
    setRepliesByPost(current => ({ ...current, [post.id]: [] }));
  }

  async function openReplyPage(post) {
    if (!post?.id) return;
    setSelectedReplyPost(post);
    setSection('Balas');
    setReplyPageLoading(true);
    await openReplies(post);
    setReplyPageLoading(false);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  async function handleReply(event, post) {
    event.preventDefault();
    if (!user) { openAuth(false); return false; }
    const body = replyDraft.trim();
    if (!body || body.length > 1000) { setNotice('Balasan harus berisi 1–1000 karakter.'); return false; }

    // Tampilkan balasan segera, lalu konfirmasi ke Firestore. Jika gagal, batalkan perubahan lokal.
    const target = replyTarget;
    const temporaryId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticReply = {
      id: temporaryId,
      authorId: user.uid,
      authorName: authorNameFor(user),
      authorPhotoURL: user.photoURL || null,
      body,
      parentReplyId: target?.id || null,
      parentAuthorName: target?.authorName || null,
      createdAt: null,
      pending: true
    };
    setRepliesByPost(current => ({
      ...current,
      [post.id]: [...(current[post.id] || []).filter(reply => reply.id !== temporaryId), optimisticReply]
    }));
    setReplyCounts(current => ({ ...current, [post.id]: (current[post.id] || 0) + 1 }));
    setReplyDraft('');
    setReplyTarget(null);
    setReplyingPostId('');

    try {
      const savedReply = await addDoc(collection(db, 'posts', post.id, 'replies'), {
        authorId: user.uid, authorName: authorNameFor(user), authorPhotoURL: user.photoURL || null, body,
        parentReplyId: target?.id || null, parentAuthorName: target?.authorName || null, createdAt: serverTimestamp()
      });
      setRepliesByPost(current => ({
        ...current,
        [post.id]: (current[post.id] || []).map(reply =>
          reply.id === temporaryId ? { ...optimisticReply, id: savedReply.id, pending: false } : reply
        )
      }));
      setNotice('Balasan berhasil dikirim.');
      return true;
    } catch (error) {
      setRepliesByPost(current => ({
        ...current,
        [post.id]: (current[post.id] || []).filter(reply => reply.id !== temporaryId)
      }));
      setReplyCounts(current => ({ ...current, [post.id]: Math.max(0, (current[post.id] || 1) - 1) }));
      setReplyDraft(body);
      setReplyingPostId(post.id);
      setReplyTarget(target || null);
      setNotice(error?.code === 'permission-denied' ? 'Balasan ditolak oleh aturan keamanan.' : 'Balasan belum terkirim. Coba lagi.');
      return false;
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

  const visiblePosts = filterPosts(allPosts, topic, search);
  const activeCategory = topic === 'Semua' ? 'Obrolan Umum' : topic;

  return <div className="app-shell">
    <header className="topbar app-header">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setSection('Beranda'); }}>
        <span className="brand-mark"><Sparkles size={21}/></span>
        <span><strong>WARKOPLINK</strong><small>Ruang obrolan Indonesia</small></span>
      </a>
      <div className="header-actions">
        <button className="button button-install" type="button" onClick={handleInstallPwa} aria-label="Pasang aplikasi" title="Pasang aplikasi"><Download size={16}/></button>
        {!authReady ? <button className="button button-dark" disabled>Memuat…</button> :
          user ? <button className="button button-dark" onClick={handleSignOut}><LogOut size={15}/> Keluar</button> :
          <><button className="button button-quiet" onClick={() => openAuth(false)}>Masuk</button><button className="button button-dark" onClick={() => openAuth(true)}>Gabung komunitas</button></>}
      </div>
    </header>

    <main>
      {section === 'Panel Admin' && isAdmin ? <AdminPanel db={db} user={user} onNotice={setNotice}/> :
      section === 'Panel Admin' ? <section className="content-section"><h2>Akses admin tidak tersedia</h2><p>Akun ini tidak memiliki hak admin. Masuk menggunakan akun admin resmi atau kembali ke beranda.</p><button className="button button-dark" onClick={() => setSection('Beranda')}>Kembali</button></section> :
      section === 'Balas' ? <section className="content-section reply-page" aria-label="Halaman balasan">
        <button className="button button-quiet reply-page-back" type="button" onClick={() => setSection('Beranda')}>← Kembali ke beranda</button>
        <span className="eyebrow">RUANG DISKUSI</span><h2>Balas obrolan</h2>
        {selectedReplyPost ? <article className="reply-original-post">
          <div className="reply-original-meta"><b>{selectedReplyPost.authorName || 'Anggota SL'}</b><span>{selectedReplyPost.topic || 'Obrolan Umum'}</span></div>
          <p>{selectedReplyPost.body}</p><small>{relativePostTime(selectedReplyPost.createdAt)}</small>
        </article> : <p>Obrolan tidak ditemukan. Kembali ke beranda untuk memilih obrolan.</p>}
        <div className="reply-thread-list" aria-label="Komentar dan balasan">
          <h3>Komentar {selectedReplyPost ? '(' + (replyCounts[selectedReplyPost.id] ?? selectedReplyPost.commentCount ?? 0) + ')' : ''}</h3>
          {replyPageLoading ? <div className="empty-state" role="status"><p>Memuat komentar…</p></div> :
            selectedReplyPost && (repliesByPost[selectedReplyPost.id] || []).length === 0
              ? <p className="reply-page-empty">Belum ada komentar. Jadilah yang pertama menanggapi.</p>
              : (selectedReplyPost ? (repliesByPost[selectedReplyPost.id] || []) : []).map(reply => <article className={reply.parentReplyId ? "reply-page-item reply-page-item-nested" : "reply-page-item"} key={reply.id}>
                  <div className="reply-page-avatar">{reply.authorPhotoURL ? <img src={reply.authorPhotoURL} alt="" loading="lazy"/> : String(reply.authorName || 'A').slice(0,1).toUpperCase()}</div>
                  <div className="reply-page-item-content">
                    {reply.parentAuthorName && <small className="reply-parent-identity">Membalas <b>{reply.parentAuthorName}</b></small>}
                    <b>{reply.authorName || 'Anggota komunitas'}</b><p className={reply.deleted ? "reply-deleted-body" : ""}>{reply.body}</p>
                    <div className="reply-comment-actions">
                      <small>{reply.pending ? 'Mengirim…' : reply.createdAt?.toDate?.() ? relativePostTime(reply.createdAt) : 'Baru saja'}</small>
                      {!reply.deleted && !reply.pending && <button className="reply-comment-menu-trigger" type="button" aria-label="Opsi komentar" aria-expanded={openCommentMenuId === reply.id} onClick={() => setOpenCommentMenuId(current => current === reply.id ? '' : reply.id)}><MoreHorizontal size={18}/></button>}
                    </div>
                    {openCommentMenuId === reply.id && !reply.deleted && !reply.pending && <div className="reply-comment-menu" role="menu">
                      <button type="button" role="menuitem" onClick={() => { setReplyTarget(reply); setOpenCommentMenuId(''); document.getElementById('reply-page-input')?.focus(); }}><MessageSquare size={14}/> Balas</button>
                      <button type="button" role="menuitem" onClick={() => { setOpenCommentMenuId(''); handleCommentReaction(selectedReplyPost, reply); }} disabled={commentActionBusyId === reply.id}><Heart size={14}/>{commentReactionSummaries[reply.id]?.mine ? 'Batal suka' : 'Suka'}{commentReactionSummaries[reply.id]?.count ? ` · ${commentReactionSummaries[reply.id].count}` : ''}</button>
                      {user?.uid === reply.authorId && <button type="button" role="menuitem" onClick={() => { setOpenCommentMenuId(''); handleDeleteReply(selectedReplyPost, reply); }} disabled={commentActionBusyId === reply.id}>Hapus komentar</button>}
                    </div>}
                  </div>
                </article>)}
          {selectedReplyPost && hasMoreRepliesByPost[selectedReplyPost.id] && <button className="button button-quiet reply-load-more" type="button" onClick={() => loadMoreReplies(selectedReplyPost)} disabled={loadingMoreRepliesPostId === selectedReplyPost.id}>{loadingMoreRepliesPostId === selectedReplyPost.id ? 'Memuat komentar…' : 'Lihat komentar sebelumnya'}</button>}
        </div>
        {selectedReplyPost && <form className="reply-page-form" onSubmit={event => handleReply(event, selectedReplyPost)}>
          {replyTarget && <div className="reply-target-banner">Membalas <b>{replyTarget.authorName || 'Anggota komunitas'}</b><button type="button" onClick={() => setReplyTarget(null)} aria-label="Batal membalas">Batal</button></div>}
          <label htmlFor="reply-page-input">{replyTarget ? 'Tulis balasan' : 'Tulis komentar'}</label>
          <textarea id="reply-page-input" autoFocus value={replyDraft} onChange={event => setReplyDraft(event.target.value)} maxLength={1000} rows={4} placeholder="Tulis tanggapan yang relevan…"/>
          <div className="reply-page-form-bottom"><small>{replyDraft.length}/1000</small><button className="button button-dark" type="submit" disabled={!replyDraft.trim() || !user}>{replyTarget ? 'Kirim balasan' : 'Kirim komentar'} <Send size={15}/></button></div>
        </form>}
      </section> :
      section === 'Akun' ? <section className="content-section account-section">
        <span className="eyebrow">AKUN ANDA</span><h2>Profil komunitas</h2>
        {user ? <><article className="account-card"><div className="account-avatar">{user.photoURL ? <img src={user.photoURL} alt="Foto profil" /> : String(user.displayName || user.email || 'A').slice(0,1).toUpperCase()}</div><div className="account-details"><b>{user.displayName || 'Anggota SL'}</b><p>{user.email}</p><small>Akun Anda siap untuk ikut berdiskusi.</small><div className="profile-photo-actions"><input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleProfilePhotoChange} /><button className="button button-quiet" type="button" onClick={() => photoInputRef.current?.click()} disabled={photoUploading}>{photoUploading ? 'Memproses foto…' : user.photoURL ? 'Ganti foto' : 'Unggah foto profil'}</button>{user.photoURL && <button className="button button-quiet" type="button" onClick={handleRemoveProfilePhoto} disabled={photoUploading}>Hapus foto</button>}</div><small>JPG, PNG, atau WebP · maksimal 2 MB.</small></div><button className="button button-dark" onClick={handleSignOut}><LogOut size={15}/> Keluar</button></article>{isAdmin && <button className="button button-dark admin-entry-button" onClick={() => setSection('Panel Admin')}><ShieldCheck size={16}/> Buka Panel Admin</button>}</> :
          <article className="account-card"><div className="account-avatar"><UserRound size={25}/></div><div><b>Gabung bersama komunitas</b><p>Buat akun untuk memulai obrolan dan berbagi pengalaman.</p></div><button className="button button-dark" onClick={() => openAuth(true)}>Daftar</button></article>}
      </section> :
      section === 'Tentang' ? <section className="content-section"><span className="eyebrow">TENTANG WARKOPLINK</span><h2>Temukan warkop, kenali lingkungan, terhubung.</h2><p>WarkopLink membantu warga menemukan dan mengenal warkop di Kabupaten Lamongan. Pendaftaran tetap gratis.</p></section> :
      (section === 'Cari Warkop' || section === 'Daftarkan Warkop') ? <WarungDirectory mode={section === 'Cari Warkop' ? 'directory' : 'register'} user={user} db={db} onRequestAuth={() => openAuth(false)} onNotice={setNotice}/> :
      (section === 'Layanan' || section === 'Jelajahi') ? <section className="content-section explore-section"><span className="eyebrow">JELAJAHI</span><h2>Temukan komunitas lokal.</h2><p>Temukan informasi lokal dan mulai percakapan yang bermanfaat.</p><div className="service-grid"><article><MapPin size={24}/><h3>Wilayah awal: Lamongan</h3><p>Fokus pada Kabupaten Lamongan, lalu diperluas bertahap.</p></article><article><Store size={24}/><h3>Pendaftaran gratis</h3><p>Tidak ada biaya untuk mendaftarkan warkop pada tahap awal.</p></article><article><ShieldCheck size={24}/><h3>Verifikasi bertahap</h3><p>Status verifikasi dan hak pemilik harus dikendalikan secara aman.</p></article></div><button className="button button-dark" onClick={() => setSection('Cari Warkop')}>Cari warkop</button></section> :
      <ChatPanel
        readOnly={section === 'Beranda'} onOpenDiscussion={() => { setSection('Obrolan'); setComposerOpen(true); }}
        user={user} firebaseConfigured={firebaseConfigured} search={search} setSearch={setSearch}
        topic={topic} setTopic={setTopic} composerOpen={composerOpen} setComposerOpen={setComposerOpen}
        openAuth={openAuth} setNotice={setNotice} draft={draft} setDraft={setDraft}
        activeCategory={activeCategory} handlePost={handlePost} posting={posting}
        postsStatus={postsStatus} setPostsRetry={setPostsRetry}
        visiblePosts={visiblePosts} hasMorePosts={hasMorePosts} loadingMorePosts={loadingMorePosts}
         loadMoreError={loadMoreError} onLoadMorePosts={loadMorePosts}
        cardProps={{
          user, relativePostTime, openPostMenuId, setOpenPostMenuId, openAuth, setNotice,
          reportingPostId, setReportingPostId, reportReason, setReportReason, sharePost,
          postReactions, reactionSummaries, handleReactPost, likeCounts, replyCounts, expandedReplies, likedPosts,
          handleLikePost, openReplies, closeReplies, repliesByPost, replyingPostId, replyDraft, setReplyDraft,
          handleReply, openReplyPage, handleReportPost, reporting, deleteConfirmId, setDeleteConfirmId,
          deletingPostId, handleDeletePost
        }}
      />}
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
      {notice && <span className="visually-hidden" role="status">{notice}</span>}
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