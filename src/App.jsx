import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EMPTY_REACTIONS, reactionFieldForEmoji, shouldRemoveReaction, summarizeReactions } from './reactions.js';
import {
  createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword,
  signOut, updateProfile
} from 'firebase/auth';
import {
  addDoc, collection, deleteDoc, doc, getCountFromServer, getDoc, getDocs, increment, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, startAfter, Timestamp, updateDoc, where
} from 'firebase/firestore';
import { auth, db, firebaseConfigured } from './firebase.js';
import AdminPanel from './AdminPanel.jsx';
import ChatPanel from './chat/ChatPanel.jsx';
import PublicUserProfile from './chat/PublicUserProfile.jsx';
import { relativePostTime } from './chat/postTime.js';
import { uploadWarkopMedia, removeWarkopAvatar, photoUploadErrorMessage } from './media/uploadWarkopMedia.js';
import { deleteOwnPost } from './services/postService.js';
import WarungDirectory from './directory/WarungDirectory.jsx';
import WarungProfile from './directory/WarungProfile.jsx';
import { MessageCircle, Users, BookOpen, Sparkles, ShieldCheck, Heart, ArrowUpRight, LogOut, Home, Compass, UserRound, Download, MapPin, Store, Send, MoreHorizontal, MessageSquare, Share2, Moon, Sun } from 'lucide-react';
import {
  FILTER_TOPICS, MAX_POST_LENGTH, POST_TOPICS, authErrorMessage, authorNameFor, canonicalTopic, filterPosts, isPublicPost,
  postErrorMessage, validateDisplayName, validateEmail, validatePassword, validatePostBody, validatePostDetails
} from './lib.js';

const POSTS_LIMIT = 10;
const FEED_CACHE_KEY = 'warkoplink:community-feed:v1';

function readCachedPosts() {
  try {
    const cached = JSON.parse(window.localStorage.getItem(FEED_CACHE_KEY) || '[]');
    if (!Array.isArray(cached)) return [];
    return cached.filter(isPublicPost).slice(0, POSTS_LIMIT).map((post) => ({
      ...post,
      createdAt: post.createdAt?.seconds != null
        ? Timestamp.fromMillis(post.createdAt.seconds * 1000 + (post.createdAt.nanoseconds || 0) / 1e6)
        : post.createdAt
    }));
  } catch {
    return [];
  }
}



function versionedPhotoURL(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    url.searchParams.set('wl_avatar_v', String(Date.now()));
    return url.toString();
  } catch {
    return value;
  }
}

export default function App() {
  const [darkMode, setDarkMode] = useState(() => window.localStorage.getItem('warkoplink:theme') === 'dark');
  const [section, setSection] = useState(() => { const params = new URLSearchParams(window.location.search); return params.get('member') ? 'Profil Anggota' : params.get('warung') ? 'Profil Warkop' : 'Beranda'; });
  const [selectedWarungId, setSelectedWarungId] = useState(() => new URLSearchParams(window.location.search).get('warung') || '');
  const [memberProfile, setMemberProfile] = useState(() => { const uid = new URLSearchParams(window.location.search).get('member') || ''; return uid ? { uid, displayName: 'Anggota WarkopLink' } : null; });
  const [verifiedWarungs, setVerifiedWarungs] = useState([]);
  const [topic, setTopic] = useState('Semua');
  const [composerTopic, setComposerTopic] = useState('Ngopi Bareng');
  const [composerOpen, setComposerOpen] = useState(false);
  const [replyingPostId, setReplyingPostId] = useState('');
  const [selectedReplyPost, setSelectedReplyPost] = useState(null);
  const [replyPageLoading, setReplyPageLoading] = useState(false);
  const [replyDraft, setReplyDraft] = useState('');
  const [replyCounts, setReplyCounts] = useState({});
  const [repliesByPost, setRepliesByPost] = useState({});
  const [replyCursorByPost, setReplyCursorByPost] = useState({});
  const [hasOlderRepliesByPost, setHasOlderRepliesByPost] = useState({});
  const [loadingOlderReplies, setLoadingOlderReplies] = useState(false);
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
  const reactionLocks = useRef(new Set());

  // Notifikasi sementara tidak boleh terus menutupi konten atau navigasi.
  useEffect(() => {
    if (!notice) return undefined;
    const timeoutId = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
    try { window.localStorage.setItem('warkoplink:theme', darkMode ? 'dark' : 'light'); } catch { /* Preferensi tema opsional. */ }
  }, [darkMode]);

  // Daftar mention hanya memuat warkop terverifikasi; hindari ketergantungan composite index nama.
  useEffect(() => {
    if (!db) { setVerifiedWarungs([]); return undefined; }
    return onSnapshot(
      query(collection(db, 'warungs'), where('verificationStatus', '==', 'verified'), limit(100)),
      snapshot => setVerifiedWarungs(snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) =>
        String(a.nameNormalized || a.name || '').localeCompare(String(b.nameNormalized || b.name || ''), 'id') || a.id.localeCompare(b.id)
      )),
      () => { setVerifiedWarungs([]); setNotice('Daftar warkop terverifikasi belum dapat dimuat. Coba muat ulang halaman.'); }
    );
  }, []);

  // Profil warkop memiliki URL yang bisa dibagikan dan tetap terbuka setelah refresh.
  useEffect(() => {
    const syncWarungRoute = () => {
      const params = new URLSearchParams(window.location.search);
      const warungId = params.get('warung') || '';
      const memberUid = params.get('member') || '';
      setSelectedWarungId(warungId);
      setMemberProfile(memberUid ? { uid: memberUid, displayName: 'Anggota WarkopLink' } : null);
      setSection(memberUid ? 'Profil Anggota' : warungId ? 'Profil Warkop' : 'Beranda');
    };
    window.addEventListener('popstate', syncWarungRoute);
    return () => window.removeEventListener('popstate', syncWarungRoute);
  }, []);

  useEffect(() => {
    if (section === 'Profil Warkop') return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('warung')) return;
    url.searchParams.delete('warung');
    window.history.replaceState(window.history.state, '', url);
  }, [section]);

  // Membuat dokumen profil jika akun Auth sudah ada tetapi profil belum tersimpan
  // (misalnya pembuatan profil gagal saat registrasi). Aman dipanggil berulang.
  const ensureProfile = useCallback(async (currentUser) => {
    if (!db || !currentUser) return true;
    try {
      const ref = doc(db, 'profiles', currentUser.uid);
      const existing = await getDoc(ref);
      const storedProfile = existing.exists() ? (existing.data() || {}) : {};
      const profile = {
        displayName: authorNameFor(currentUser),
        email: currentUser.email || '',
        photoURL: currentUser.photoURL || '',
        ...storedProfile
      };
      if (!existing.exists()) {
        await setDoc(ref, {
          ...profile,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      // Profil publik terpisah: tidak pernah menyalin email atau field privat.
      await setDoc(doc(db, 'publicProfiles', currentUser.uid), {
        uid: currentUser.uid,
        displayName: profile.displayName || authorNameFor(currentUser),
        photoURL: versionedPhotoURL(currentUser.photoURL || profile.photoURL || ''),
        updatedAt: serverTimestamp()
      }, { merge: true });
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
      const publicPosts = nextPosts.filter(isPublicPost);
      setPosts(publicPosts);
      setLastPostDoc(snapshot.docs.at(-1) || null);
      setHasMorePosts(snapshot.docs.length === POSTS_LIMIT);
      setPostsStatus('ready');
      try {
        window.localStorage.setItem(FEED_CACHE_KEY, JSON.stringify(publicPosts.slice(0, POSTS_LIMIT)));
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
      const nextRows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter(isPublicPost);
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
          await setDoc(doc(db, 'publicProfiles', result.user.uid), {
            uid: result.user.uid,
            displayName: nameCheck.value,
            photoURL: versionedPhotoURL(result.user.photoURL || ''),
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

  async function handlePost(event, details = {}) {
    event.preventDefault();
    if (!user) {
      openAuth(false);
      setNotice('Masuk atau buat akun terlebih dahulu untuk mengirim obrolan.');
      return;
    }
    const bodyCheck = validatePostBody(draft);
    if (!bodyCheck.ok) return setNotice(bodyCheck.error);
    const detailsCheck = validatePostDetails(composerTopic, details);
    if (!detailsCheck.ok) return setNotice(detailsCheck.error);
    if (details.eventPosterFile && (composerTopic !== 'Info & Acara' || !details.eventWarungId || !verifiedWarungs.some(warung => warung.id === details.eventWarungId && warung.ownerUid === user.uid))) {
      setNotice('Pilih warkop terverifikasi milik akun Anda sebelum mengunggah poster.');
      return false;
    }
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
        topic: composerTopic,
        ...(details.postType?.trim() ? { postType: details.postType.trim() } : {}),
        ...(details.location?.trim() ? { location: details.location.trim() } : {}),
        ...(details.eventDate?.trim() ? { eventDate: details.eventDate.trim() } : {}),
        ...(composerTopic === 'Info & Acara' && details.eventStartAt ? { eventStartAt: details.eventStartAt } : {}),
        ...(composerTopic === 'Info & Acara' && details.eventEndAt ? { eventEndAt: details.eventEndAt } : {}),
        ...(composerTopic === 'Info & Acara' ? { eventKind: String(details.eventKind || 'Lainnya').slice(0, 40) } : {}),
        ...(composerTopic === 'Info & Acara' && details.eventCapacity && Number(details.eventCapacity) > 0 ? { eventCapacity: Math.min(10000, Math.floor(Number(details.eventCapacity))) } : {}),
        ...(composerTopic === 'Info & Acara' && details.eventPosterFile ? { warungId: details.eventWarungId } : {}),
        ...(details.price?.trim() ? { price: details.price.trim() } : {}),
        ...(details.workType?.trim() ? { workType: details.workType.trim() } : {}),
        ...(details.contact?.trim() ? { contact: details.contact.trim() } : {}),
        createdAt: serverTimestamp(),
        reactions: { ...EMPTY_REACTIONS },
        totalReactions: 0
      });
      let posterNotice = '';
      if (composerTopic === 'Info & Acara' && details.eventPosterFile) {
        try {
          await uploadWarkopMedia({ user, mediaType: 'event', resourceId: postRef.id, file: details.eventPosterFile });
        } catch (error) {
          posterNotice = ` Acara sudah terbit, tetapi poster belum berhasil diunggah: ${photoUploadErrorMessage(error)}`;
        }
      }
      setDraft('');
      setNotice(posterNotice ? `Obrolan berhasil dipublikasikan.${posterNotice}` : 'Obrolan berhasil dipublikasikan.');
      return true;
    } catch (error) {
      setNotice(postErrorMessage(error));
    } finally {
      setPosting(false);
    }
  }

  async function handleEditPost(event, post, values) {
    event.preventDefault();
    if (!user || !db || !post?.id || post.authorId !== user.uid) {
      setNotice('Hanya pemilik posting yang dapat mengeditnya.');
      return false;
    }
    const bodyCheck = validatePostBody(values.body);
    if (!bodyCheck.ok) { setNotice(bodyCheck.error); return false; }
    const detailsCheck = validatePostDetails(values.topic, values);
    if (!detailsCheck.ok) { setNotice(detailsCheck.error); return false; }
    if (values.topic === 'Info & Acara' && values.eventStartAt && values.eventEndAt
      && new Date(values.eventEndAt).getTime() <= new Date(values.eventStartAt).getTime()) {
      setNotice('Waktu selesai harus setelah waktu mulai acara.');
      return false;
    }
    try {
      const updates = {
        body: bodyCheck.value,
        topic: values.topic,
        postType: String(values.postType || '').trim(),
        location: String(values.location || '').trim(),
        eventDate: String(values.eventDate || '').trim(),
        price: String(values.price || '').trim(),
        workType: String(values.workType || '').trim(),
        contact: String(values.contact || '').trim()
      };
      if (values.topic === 'Info & Acara') {
        updates.eventStartAt = String(values.eventStartAt || '').trim();
        updates.eventEndAt = String(values.eventEndAt || '').trim();
        updates.eventKind = String(values.eventKind || 'Nobar').trim().slice(0, 40);
        if (String(values.eventCapacity || '').trim()) {
          const capacity = Number(values.eventCapacity);
          if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000) {
            setNotice('Kapasitas acara harus 1–10.000 orang.');
            return false;
          }
          updates.eventCapacity = capacity;
        }
        updates.eventStatus = values.eventStatus === 'cancelled' ? 'cancelled' : 'scheduled';
      }
      await updateDoc(doc(db, 'posts', post.id), updates);
      setNotice('Posting berhasil diperbarui.');
      return true;
    } catch (error) {
      setNotice(error?.code === 'permission-denied'
        ? 'Edit ditolak oleh aturan keamanan.'
        : 'Posting belum dapat diperbarui. Periksa koneksi lalu coba lagi.');
      return false;
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
    if (reactionLocks.current.has(postId)) return;
    reactionLocks.current.add(postId);
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
        ? 'Suka ditolak oleh aturan keamanan.'
        : 'Suka belum tersimpan. Coba lagi.');
    } finally {
      reactionLocks.current.delete(postId);
    }
  }

  async function handleLikePost(post) {
    if (!user) { openAuth(false); setNotice('Masuk terlebih dahulu untuk menyukai postingan.'); return; }
    if (!db || !post?.id || reactionLocks.current.has(post.id)) return;
    // Reaksi lama tanpa emoji tetap bisa dibatalkan, tanpa menghapus data pengguna lain.
    if (likedPosts[post.id] && !postReactions[post.id]) {
      const postId = post.id;
      reactionLocks.current.add(postId);
      const previousCount = likeCounts[postId] ?? post.totalReactions ?? 0;
      const previousSummary = reactionSummaries[postId] || { reactions: { ...(post.reactions || EMPTY_REACTIONS) }, totalReactions: previousCount };
      setLikedPosts(current => ({ ...current, [postId]: false }));
      setLikeCounts(current => ({ ...current, [postId]: Math.max(0, previousCount - 1) }));
      setReactionSummaries(current => ({ ...current, [postId]: { ...previousSummary, totalReactions: Math.max(0, previousSummary.totalReactions - 1), reactions: { ...previousSummary.reactions, like: Math.max(0, (previousSummary.reactions.like || 0) - 1) } } }));
      try {
        await runTransaction(db, async transaction => {
          const reactionRef = doc(db, 'posts', postId, 'likes', user.uid);
          const postRef = doc(db, 'posts', postId);
          const [reactionSnapshot, postSnapshot] = await Promise.all([transaction.get(reactionRef), transaction.get(postRef)]);
          if (!reactionSnapshot.exists()) return;
          const data = reactionSnapshot.data();
          if (typeof data.emoji === 'string' && data.emoji) throw new Error('reaction-changed');
          transaction.delete(reactionRef);
          const postData = postSnapshot.exists() ? postSnapshot.data() : {};
          if (postData.reactions && typeof postData.totalReactions === 'number') {
            transaction.update(postRef, { 'reactions.like': increment(-1), totalReactions: increment(-1) });
          }
        });
      } catch {
        setLikedPosts(current => ({ ...current, [postId]: true }));
        setLikeCounts(current => ({ ...current, [postId]: previousCount }));
        setReactionSummaries(current => ({ ...current, [postId]: previousSummary }));
        setNotice('Suka lama belum dapat dibatalkan. Coba lagi.');
      } finally {
        reactionLocks.current.delete(postId);
      }
      return;
    }
    return handleReactPost(post, likedPosts[post.id] && postReactions[post.id] ? postReactions[post.id] : '❤️');
  }

  async function openReplies(post) {
    if (!db || !post?.id) return [];
    setReplyingPostId(post.id);
    setReplyDraft('');
    try {
      // Ambil lima komentar terbaru, lalu tampilkan kronologis dari yang lama ke baru.
      const [snapshot, countSnapshot] = await Promise.all([
        getDocs(query(
          collection(db, 'posts', post.id, 'replies'),
          orderBy('createdAt', 'desc'),
          limit(5)
        )),
        getCountFromServer(collection(db, 'posts', post.id, 'replies'))
      ]);
      const replies = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).reverse();
      setReplyCursorByPost(current => ({ ...current, [post.id]: snapshot.docs.at(-1) || null }));
      setHasOlderRepliesByPost(current => ({ ...current, [post.id]: snapshot.docs.length === 5 }));
      setRepliesByPost(current => {
        const pendingReplies = (current[post.id] || []).filter(reply => reply.pending);
        const serverIds = new Set(replies.map(reply => reply.id));
        return {
          ...current,
          [post.id]: [...replies, ...pendingReplies.filter(reply => !serverIds.has(reply.id))]
        };
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

  async function loadOlderReplies(post) {
    if (!db || !post?.id || !replyCursorByPost[post.id] || loadingOlderReplies || !hasOlderRepliesByPost[post.id]) return;
    setLoadingOlderReplies(true);
    try {
      const snapshot = await getDocs(query(
        collection(db, 'posts', post.id, 'replies'),
        orderBy('createdAt', 'desc'),
        startAfter(replyCursorByPost[post.id]),
        limit(5)
      ));
      const olderReplies = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).reverse();
      setRepliesByPost(current => {
        const existing = current[post.id] || [];
        const ids = new Set(existing.map(reply => reply.id));
        const uniqueOlder = olderReplies.filter(reply => !ids.has(reply.id));
        const pending = existing.filter(reply => reply.pending);
        const serverReplies = existing.filter(reply => !reply.pending);
        return { ...current, [post.id]: [...uniqueOlder, ...serverReplies, ...pending] };
      });
      setReplyCursorByPost(current => ({ ...current, [post.id]: snapshot.docs.at(-1) || current[post.id] }));
      setHasOlderRepliesByPost(current => ({ ...current, [post.id]: snapshot.docs.length === 5 }));
    } catch {
      setNotice('Komentar yang lebih lama belum dapat dimuat. Coba lagi.');
    } finally {
      setLoadingOlderReplies(false);
    }
  }

  function closeReplies(post) {
    if (!post?.id) return;
    setReplyingPostId(current => current === post.id ? '' : current);
    setReplyDraft('');
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
    const temporaryId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticReply = {
      id: temporaryId,
      authorId: user.uid,
      authorName: authorNameFor(user),
      authorPhotoURL: user.photoURL || null,
      body,
      createdAt: null,
      pending: true
    };
    setRepliesByPost(current => ({
      ...current,
      [post.id]: [...(current[post.id] || []).filter(reply => reply.id !== temporaryId), optimisticReply]
    }));
    setReplyCounts(current => ({ ...current, [post.id]: (current[post.id] || 0) + 1 }));
    setReplyDraft('');
    setReplyingPostId('');

    try {
      const savedReply = await addDoc(collection(db, 'posts', post.id, 'replies'), {
        authorId: user.uid, authorName: authorNameFor(user), authorPhotoURL: user.photoURL || null, body, createdAt: serverTimestamp()
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
      setNotice(error?.code === 'permission-denied' ? 'Balasan ditolak oleh aturan keamanan.' : 'Balasan belum terkirim. Coba lagi.');
      return false;
    }
  }

  async function sharePost(post) {
    const shareUrl = `${window.location.origin}/#post-${encodeURIComponent(post.id)}`;
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
    if (!file || !user || !db) {
      if (file) setNotice('Masuk terlebih dahulu untuk mengunggah foto profil.');
      return;
    }
    setPhotoUploading(true);
    try {
      const hasProfile = await ensureProfile(user);
      if (!hasProfile) throw new Error('profile-not-ready');
      await uploadWarkopMedia({ user, mediaType: 'avatar', file });
      await auth.currentUser?.reload();
      setUser({ ...auth.currentUser });
      setNotice('Foto profil berhasil diperbarui.');
    } catch (error) {
      console.warn('Unggah foto profil gagal:', error?.message || 'unknown');
      setNotice(photoUploadErrorMessage(error));
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleRemoveProfilePhoto() {
    if (!user || !db || !user.photoURL) return;
    setPhotoUploading(true);
    try {
      await removeWarkopAvatar(user);
      await auth.currentUser?.reload();
      setUser({ ...auth.currentUser });
      setNotice('Foto profil dihapus.');
    } catch (error) {
      console.warn('Hapus foto profil gagal:', error?.message || 'unknown');
      setNotice(photoUploadErrorMessage(error, 'Foto profil belum berhasil dihapus. Coba lagi beberapa saat.'));
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

  function openMemberProfile(profile) {
    if (!profile?.uid) return;
    const nextProfile = { uid: profile.uid, displayName: profile.displayName || 'Anggota WarkopLink', photoURL: profile.photoURL || '' };
    setMemberProfile(nextProfile);
    const url = new URL(window.location.href);
    url.searchParams.delete('warung');
    url.searchParams.set('member', profile.uid);
    window.history.pushState({ memberUid: profile.uid }, '', url);
    setSection('Profil Anggota');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function closeMemberProfile() {
    if (new URLSearchParams(window.location.search).has('member')) {
      window.history.back();
      return;
    }
    setMemberProfile(null);
    setSection('Obrolan');
  }

  function openWarungProfile(warungId) {
    if (!warungId) return;
    setSelectedWarungId(warungId);
    const url = new URL(window.location.href);
    url.searchParams.set('warung', warungId);
    window.history.pushState({ warungId }, '', url);
    setSection('Profil Warkop');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  const visiblePosts = filterPosts(allPosts, topic, search);
  const activeCategory = composerTopic;
  const popularTopics = POST_TOPICS.map(name => ({ name, count: allPosts.filter(post => canonicalTopic(post.topic) === name).length }))
    .filter(item => item.count > 0).sort((left, right) => right.count - left.count).slice(0, 4);
  const recentSidebarPosts = allPosts.slice(0, 3);

  return <div className={section === 'Beranda' ? 'app-shell home-view' : 'app-shell secondary-view'}>
    <header className="topbar app-header">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setSection('Beranda'); }}>
        <span className="brand-mark"><Sparkles size={21}/></span>
        <span><strong>WARKOPLINK</strong><small>Ruang obrolan Indonesia</small></span>
      </a>
      <div className="header-actions">
        <button className="button button-theme-toggle" type="button" onClick={() => setDarkMode(value => !value)} aria-label={darkMode ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'} title={darkMode ? 'Mode terang' : 'Mode gelap'}><span className="theme-toggle-icon" aria-hidden="true">{darkMode ? <Sun size={16}/> : <Moon size={16}/>}</span></button>
        {(installPrompt || (/iphone|ipad|ipod/i.test(navigator.userAgent) && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios|opios/i.test(navigator.userAgent))) && <button className="button button-install" type="button" onClick={handleInstallPwa} aria-label="Pasang aplikasi" title="Pasang aplikasi"><Download size={16}/></button>}
        {!authReady ? <button className="button button-dark" disabled>Memuat…</button> :
          user ? <button className="button button-dark" onClick={handleSignOut}><LogOut size={15}/> Keluar</button> :
          <><button className="button button-quiet" onClick={() => openAuth(false)}>Masuk</button><button className="button button-dark" onClick={() => openAuth(true)}>Gabung komunitas</button></>}
      </div>
    </header>

    <div className="desktop-layout">
      <aside className="desktop-sidebar" aria-label="Navigasi desktop">
        <div className="sidebar-brand"><span className="sidebar-brand-mark"><Sparkles size={18}/></span><span><b>WarkopLink</b><small>Ruang komunitas lokal</small></span></div>
        <p className="sidebar-label">MENU UTAMA</p>
        <nav className="sidebar-nav" aria-label="Navigasi utama">
          <button type="button" aria-label="Desktop: Beranda" className={section === 'Beranda' ? 'sidebar-nav-item active' : 'sidebar-nav-item'} onClick={() => { setSection('Beranda'); window.scrollTo({ top: 0, behavior: 'auto' }); }}><Home size={18}/><span>Beranda</span></button>
          <button type="button" aria-label="Desktop: Cari Warkop" className={section === 'Cari Warkop' ? 'sidebar-nav-item active' : 'sidebar-nav-item'} onClick={() => { setSection('Cari Warkop'); window.scrollTo({ top: 0, behavior: 'auto' }); }}><Compass size={18}/><span>Cari Warkop</span></button>
          <button type="button" aria-label="Desktop: Obrolan" className={section === 'Obrolan' && topic === 'Semua' ? 'sidebar-nav-item active' : 'sidebar-nav-item'} onClick={() => { setSection('Obrolan'); setTopic('Semua'); setSearch(''); window.scrollTo({ top: 0, behavior: 'auto' }); }}><MessageCircle size={18}/><span>Obrolan</span></button>
          <button type="button" aria-label="Desktop: Agenda & acara" className={section === 'Obrolan' && topic === 'Info & Acara' ? 'sidebar-nav-item active' : 'sidebar-nav-item'} onClick={() => { setSection('Obrolan'); setTopic('Info & Acara'); setSearch(''); window.scrollTo({ top: 0, behavior: 'auto' }); }}><BookOpen size={18}/><span>Agenda & acara</span></button>
          <button type="button" aria-label="Desktop: Jual beli & jasa" className={section === 'Obrolan' && topic === 'Jual Beli & Jasa Lokal' ? 'sidebar-nav-item active' : 'sidebar-nav-item'} onClick={() => { setSection('Obrolan'); setTopic('Jual Beli & Jasa Lokal'); setSearch(''); window.scrollTo({ top: 0, behavior: 'auto' }); }}><Store size={18}/><span>Jual beli & jasa</span></button>
          <button type="button" aria-label="Desktop: Daftarkan warkop" className={section === 'Daftarkan Warkop' ? 'sidebar-nav-item active' : 'sidebar-nav-item'} onClick={() => { setSection('Daftarkan Warkop'); window.scrollTo({ top: 0, behavior: 'auto' }); }}><ArrowUpRight size={18}/><span>Daftarkan warkop</span></button>
          <button type="button" className="sidebar-nav-item" onClick={() => setNotice('Menu Tersimpan belum tersedia. Tidak ada daftar tersimpan yang dibuat-buat.') }><Heart size={18}/><span>Tersimpan</span><span className="sidebar-soon">Segera</span></button>
        </nav>
        <div className="sidebar-community-note"><span className="sidebar-note-icon"><MapPin size={16}/></span><div><b>Mulai dari Lamongan</b><p>Temukan warkop dan percakapan di sekitar komunitas lokal.</p></div></div>
        <button type="button" className="sidebar-profile" onClick={() => setSection('Akun')}>
          <span className="sidebar-profile-avatar">{user?.photoURL ? <img src={user.photoURL} alt="" /> : String(user?.displayName || user?.email || 'W').slice(0,1).toUpperCase()}</span>
          <span className="sidebar-profile-copy"><b>{user?.displayName || (user ? 'Anggota WarkopLink' : 'Pengunjung')}</b><small>{user ? 'Akun komunitas' : 'Masuk untuk berinteraksi'}</small></span>
          <MoreHorizontal size={18}/>
        </button>
      </aside>
      <main>
      {section === 'Panel Admin' && isAdmin ? <AdminPanel db={db} user={user} onNotice={setNotice}/> :
      section === 'Panel Admin' ? <section className="content-section"><h2>Akses admin tidak tersedia</h2><p>Akun ini tidak memiliki hak admin. Masuk menggunakan akun admin resmi atau kembali ke beranda.</p><button className="button button-dark" onClick={() => setSection('Beranda')}>Kembali</button></section> :
      section === 'Balas' ? <section className="content-section reply-page" aria-label="Halaman balasan">
        <div className="reply-page-top">
          <button className="reply-page-back" type="button" onClick={() => setSection('Beranda')}>← Kembali ke beranda</button>
          <h2>Komentar</h2>
        </div>
        {selectedReplyPost ? <article className="reply-original-post">
          <button type="button" className="reply-original-avatar reply-profile-link" aria-label={`Lihat profil ${selectedReplyPost.authorName || 'Anggota'}`} onClick={() => openMemberProfile({ uid: selectedReplyPost.authorId, displayName: selectedReplyPost.authorName, photoURL: selectedReplyPost.authorPhotoURL })}>{selectedReplyPost.authorPhotoURL ? <img src={selectedReplyPost.authorPhotoURL} alt="" loading="lazy"/> : String(selectedReplyPost.authorName || 'A').slice(0,1).toUpperCase()}</button>
          <div className="reply-original-body">
            <div className="reply-original-meta"><button type="button" className="reply-profile-name" onClick={() => openMemberProfile({ uid: selectedReplyPost.authorId, displayName: selectedReplyPost.authorName, photoURL: selectedReplyPost.authorPhotoURL })}>{selectedReplyPost.authorName || 'Anggota SL'}</button><span>{selectedReplyPost.topic || 'Obrolan Umum'}</span><small>{relativePostTime(selectedReplyPost.createdAt)}</small></div>
            <p>{selectedReplyPost.body}</p>
          </div>
        </article> : <p>Obrolan tidak ditemukan. Kembali ke beranda untuk memilih obrolan.</p>}
        <div className="reply-thread-list" aria-label="Komentar dan balasan">
          <h3>{selectedReplyPost ? (replyCounts[selectedReplyPost.id] ?? selectedReplyPost.commentCount ?? 0) + ' komentar' : 'Komentar'}</h3>
          {selectedReplyPost && hasOlderRepliesByPost[selectedReplyPost.id] && <button className="button button-quiet" type="button" onClick={() => loadOlderReplies(selectedReplyPost)} disabled={loadingOlderReplies} aria-busy={loadingOlderReplies}>{loadingOlderReplies ? 'Memuat komentar…' : 'Muat komentar lebih lama'}</button>}
          {replyPageLoading ? <div className="empty-state" role="status"><p>Memuat komentar…</p></div> :
            selectedReplyPost && (repliesByPost[selectedReplyPost.id] || []).length === 0
              ? <p className="reply-page-empty">Belum ada komentar. Jadilah yang pertama menanggapi.</p>
              : (selectedReplyPost ? (repliesByPost[selectedReplyPost.id] || []) : []).map(reply => <article className={reply.pending ? 'reply-page-item is-pending' : 'reply-page-item'} key={reply.id}>
                  <button type="button" className="reply-page-avatar reply-profile-link" aria-label={`Lihat profil ${reply.authorName || 'Anggota'}`} onClick={() => openMemberProfile({ uid: reply.authorId, displayName: reply.authorName, photoURL: reply.authorPhotoURL })}>{reply.authorPhotoURL ? <img src={reply.authorPhotoURL} alt="" loading="lazy"/> : String(reply.authorName || 'A').slice(0,1).toUpperCase()}</button>
                  <div className="reply-page-main">
                    <div className="reply-bubble"><button type="button" className="reply-profile-name" onClick={() => openMemberProfile({ uid: reply.authorId, displayName: reply.authorName, photoURL: reply.authorPhotoURL })}>{reply.authorName || 'Anggota komunitas'}</button><p>{reply.body}</p></div>
                    <small>{reply.pending ? 'Mengirim…' : reply.createdAt?.toDate?.() ? relativePostTime(reply.createdAt) : 'Baru saja'}</small>
                  </div>
                </article>)}
        </div>
        {selectedReplyPost && <form className="reply-page-form" onSubmit={event => handleReply(event, selectedReplyPost)}>
          <label className="sr-only" htmlFor="reply-page-input">Tulis komentar</label>
          <textarea id="reply-page-input" autoFocus value={replyDraft} onChange={event => setReplyDraft(event.target.value)} maxLength={1000} rows={1} placeholder="Tulis komentar…"/>
          <button className="reply-send" type="submit" aria-label="Kirim balasan" disabled={!replyDraft.trim()}><Send size={18}/></button>
          {replyDraft.length > 800 && <small className="reply-counter" aria-live="polite">{replyDraft.length}/1000</small>}
        </form>}
      </section> :
      section === 'Profil Anggota' && memberProfile ? <PublicUserProfile profile={memberProfile} db={db} currentUser={user} onBack={closeMemberProfile} onEditProfile={() => setSection('Akun')}/> :
      section === 'Akun' ? <section className="content-section account-section">
        <span className="eyebrow">AKUN ANDA</span><h2>Profil komunitas</h2>
        {user ? <><article className="account-card"><div className="account-avatar">{user.photoURL ? <img src={user.photoURL} alt="Foto profil" /> : String(user.displayName || user.email || 'A').slice(0,1).toUpperCase()}</div><div className="account-details"><b>{user.displayName || 'Anggota SL'}</b><p>{user.email}</p><small>Akun Anda siap untuk ikut berdiskusi.</small><div className="profile-photo-actions"><input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleProfilePhotoChange} /><button className="button button-quiet" type="button" onClick={() => photoInputRef.current?.click()} disabled={photoUploading}>{photoUploading ? 'Memproses foto…' : user.photoURL ? 'Ganti foto' : 'Unggah foto profil'}</button>{user.photoURL && <button className="button button-quiet" type="button" onClick={handleRemoveProfilePhoto} disabled={photoUploading}>Hapus foto</button>}</div><small>JPG, PNG, atau WebP · maksimal 2 MB.</small></div><button className="button button-dark" onClick={handleSignOut}><LogOut size={15}/> Keluar</button></article>{isAdmin && <button className="button button-dark admin-entry-button" onClick={() => setSection('Panel Admin')}><ShieldCheck size={16}/> Buka Panel Admin</button>}</> :
          <article className="account-card"><div className="account-avatar"><UserRound size={25}/></div><div><b>Gabung bersama komunitas</b><p>Buat akun untuk memulai obrolan dan berbagi pengalaman.</p></div><button className="button button-dark" onClick={() => openAuth(true)}>Daftar</button></article>}
      </section> :
      section === 'Tentang' ? <section className="content-section"><span className="eyebrow">TENTANG WARKOPLINK</span><h2>Temukan warkop, kenali lingkungan, terhubung.</h2><p>WarkopLink membantu warga menemukan dan mengenal warkop di Kabupaten Lamongan. Pendaftaran tetap gratis.</p></section> :
      section === 'Profil Warkop' ? <WarungProfile warungId={selectedWarungId} db={db} user={user} onBack={() => setSection('Cari Warkop')} onRequestAuth={() => openAuth(false)} onNotice={setNotice}/> :
      (section === 'Cari Warkop' || section === 'Daftarkan Warkop') ? <WarungDirectory mode={section === 'Cari Warkop' ? 'directory' : 'register'} user={user} db={db} onRequestAuth={() => openAuth(false)} onNotice={setNotice} onOpenWarung={openWarungProfile} onRegister={() => setSection('Daftarkan Warkop')}/> :
      (section === 'Layanan' || section === 'Jelajahi') ? <section className="content-section explore-section"><span className="eyebrow">JELAJAHI</span><h2>Temukan komunitas lokal.</h2><p>Temukan informasi lokal dan mulai percakapan yang bermanfaat.</p><div className="service-grid"><article><MapPin size={24}/><h3>Wilayah awal: Lamongan</h3><p>Fokus pada Kabupaten Lamongan, lalu diperluas bertahap.</p></article><article><Store size={24}/><h3>Pendaftaran gratis</h3><p>Tidak ada biaya untuk mendaftarkan warkop pada tahap awal.</p></article><article><ShieldCheck size={24}/><h3>Verifikasi bertahap</h3><p>Status verifikasi dan hak pemilik harus dikendalikan secara aman.</p></article></div><button className="button button-dark" onClick={() => setSection('Cari Warkop')}>Cari warkop</button></section> :
      <ChatPanel
        readOnly={section === 'Beranda'} previewMode={section === 'Beranda'}
        onViewAllDiscussions={() => { setSection('Obrolan'); setTopic('Semua'); setSearch(''); window.scrollTo({ top: 0, behavior: 'auto' }); }}
        onOpenDiscussion={() => { setSection('Obrolan'); setComposerOpen(true); window.scrollTo({ top: 0, behavior: 'auto' }); }}
        onOpenDirectory={() => setSection('Cari Warkop')}
        user={user} firebaseConfigured={firebaseConfigured} search={search} setSearch={setSearch}
        topic={topic} setTopic={setTopic} composerTopic={composerTopic} setComposerTopic={setComposerTopic} composerOpen={composerOpen} setComposerOpen={setComposerOpen}
        openAuth={openAuth} setNotice={setNotice} draft={draft} setDraft={setDraft}
        activeCategory={activeCategory} handlePost={handlePost} posting={posting} verifiedWarungs={verifiedWarungs} ownVerifiedWarungs={verifiedWarungs.filter(warung => warung.ownerUid === user?.uid)}
        postsStatus={postsStatus} setPostsRetry={setPostsRetry}
        visiblePosts={visiblePosts} hasMorePosts={hasMorePosts} loadingMorePosts={loadingMorePosts}
         loadMoreError={loadMoreError} onLoadMorePosts={loadMorePosts}
        cardProps={{
          user, relativePostTime, openPostMenuId, setOpenPostMenuId, openAuth, setNotice, verifiedWarungs, onOpenWarung: openWarungProfile,
          reportingPostId, setReportingPostId, reportReason, setReportReason, sharePost, onOpenProfile: openMemberProfile,
          postReactions, reactionSummaries, handleReactPost, likeCounts, replyCounts, expandedReplies, likedPosts,
          handleLikePost, openReplies, closeReplies, repliesByPost, replyingPostId, replyDraft, setReplyDraft,
          handleReply, openReplyPage, handleReportPost, reporting, deleteConfirmId, setDeleteConfirmId,
          deletingPostId, handleDeletePost, onEditPost: handleEditPost
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
      {notice && <div className="app-notice" role="status" aria-live="polite">{notice}</div>}
      </main>
      {(section === 'Beranda' || section === 'Obrolan') && <aside className="desktop-right-rail" aria-label="Ringkasan komunitas">
        <section className="rail-panel">
          <div className="rail-panel-heading"><h2>Warkop terverifikasi</h2><span>{verifiedWarungs.length}</span></div>
          {verifiedWarungs.length ? <div className="rail-warung-list">{verifiedWarungs.slice(0, 4).map(warung => <button type="button" key={warung.id} className="rail-warung" onClick={() => openWarungProfile(warung.id)}><span className="rail-warung-avatar"><Store size={15}/></span><span><b>{warung.name || 'Warkop lokal'}</b><small>{warung.address || 'Profil warkop terverifikasi'}</small></span><ArrowUpRight size={14}/></button>)}</div> : <p className="rail-empty">Belum ada warkop terverifikasi untuk ditampilkan.</p>}
          <button type="button" className="rail-text-link" onClick={() => setSection('Cari Warkop')}>Jelajahi direktori <ArrowUpRight size={14}/></button>
        </section>
        <section className="rail-panel">
          <div className="rail-panel-heading"><h2>Kategori aktif</h2><span>TOPIK LOKAL</span></div>
          {popularTopics.length ? <div className="rail-topic-list">{popularTopics.map(item => <button type="button" className="rail-topic" key={item.name} onClick={() => { setSection('Obrolan'); setTopic(item.name); setSearch(''); window.scrollTo({ top: 0, behavior: 'auto' }); }}><span><b>{item.name}</b><small>{item.count} obrolan</small></span><ArrowUpRight size={14}/></button>)}</div> : <p className="rail-empty">Kategori akan muncul setelah ada obrolan komunitas.</p>}
        </section>
        <section className="rail-panel rail-recent-panel">
          <div className="rail-panel-heading"><h2>Obrolan terbaru</h2><span>{allPosts.length}</span></div>
          {recentSidebarPosts.length ? recentSidebarPosts.map(post => <button type="button" className="rail-recent-post" key={post.id} onClick={() => { setSection('Obrolan'); setTopic('Semua'); setSearch(''); window.scrollTo({ top: 0, behavior: 'auto' }); }}><b>{post.authorName || 'Anggota komunitas'}</b><p>“{String(post.body || '').slice(0, 92)}{String(post.body || '').length > 92 ? '…' : ''}”</p><small>{post.topic || 'Ngopi Bareng'}</small></button>) : <p className="rail-empty">Belum ada obrolan terbaru.</p>}
        </section>
      </aside>}
    </div>
    <nav className="bottom-nav" aria-label="Navigasi aplikasi">
      <button className={section === 'Beranda' ? 'bottom-nav-item active' : 'bottom-nav-item'} onClick={() => setSection('Beranda')} aria-current={section === 'Beranda' ? 'page' : undefined}><Home size={20}/><span>Beranda</span></button>
      <button className={section === 'Cari Warkop' ? 'bottom-nav-item active' : 'bottom-nav-item'} onClick={() => setSection('Cari Warkop')} aria-current={section === 'Cari Warkop' ? 'page' : undefined}><Compass size={20}/><span>Cari Warkop</span></button>
      <button className={section === "Obrolan" ? "bottom-nav-item active" : "bottom-nav-item"} onClick={() => { setSection("Obrolan"); document.getElementById("community-feed")?.scrollIntoView({behavior:"smooth"}); }} aria-current={section === "Obrolan" ? "page" : undefined}><MessageCircle size={20}/><span>Obrolan</span></button>
      <button className={section === 'Daftarkan Warkop' ? 'bottom-nav-item active' : 'bottom-nav-item'} onClick={() => setSection('Daftarkan Warkop')} aria-current={section === 'Daftarkan Warkop' ? 'page' : undefined}><Store size={20}/><span>Daftar</span></button>
      <button className={section === 'Akun' ? 'bottom-nav-item active' : 'bottom-nav-item'} onClick={() => setSection('Akun')} aria-current={section === 'Akun' ? 'page' : undefined}><UserRound size={20}/><span>Akun</span></button>
    </nav>
    <footer><span className="footer-brand"><Sparkles size={16}/> WARKOPLINK</span><span>Ruang digital untuk saling terhubung.</span><small>© {new Date().getFullYear()} WarkopLink Platform</small></footer>
  </div>;
}