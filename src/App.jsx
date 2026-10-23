import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword,
  signOut, updateProfile
} from 'firebase/auth';
import {
  addDoc, collection, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc
} from 'firebase/firestore';
import { auth, db, firebaseConfigured } from './firebase.js';
import { MessageCircle, Users, BookOpen, Sparkles, ShieldCheck, Heart, ArrowUpRight, LogOut, Home, Compass, UserRound } from 'lucide-react';
import {
  FILTER_TOPICS, MAX_POST_LENGTH, POST_TOPICS, authErrorMessage, authorNameFor, filterPosts,
  postErrorMessage, validateDisplayName, validateEmail, validatePassword, validatePostBody
} from './lib.js';

const POSTS_LIMIT = 100;

export default function App() {
  const [section, setSection] = useState('Beranda');
  const [topic, setTopic] = useState('Semua');
  const [composerTopic, setComposerTopic] = useState(POST_TOPICS[0]);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [user, setUser] = useState(null);
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
    if (!auth) return undefined;
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
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
        setNotice('Berhasil masuk ke SL Community.');
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
        <span><strong>SL COMMUNITY</strong><small>Ruang obrolan Indonesia</small></span>
      </a>
      <div className="header-actions">
        {!authReady ? <button className="button button-dark" disabled>Memuat…</button> :
          user ? <button className="button button-dark" onClick={handleSignOut}><LogOut size={15}/> Keluar</button> :
          <><button className="button button-quiet" onClick={() => openAuth(false)}>Masuk</button><button className="button button-dark" onClick={() => openAuth(true)}>Gabung komunitas</button></>}
      </div>
    </header>

    <main>
      {section === 'Akun' ? <section className="content-section account-section">
        <span className="eyebrow">AKUN ANDA</span><h2>Profil komunitas</h2>
        {user ? <article className="account-card"><div className="account-avatar">{String(user.displayName || user.email || 'A').slice(0,1).toUpperCase()}</div><div><b>{user.displayName || 'Anggota SL'}</b><p>{user.email}</p><small>Akun Anda siap untuk ikut berdiskusi.</small></div><button className="button button-dark" onClick={handleSignOut}><LogOut size={15}/> Keluar</button></article> :
          <article className="account-card"><div className="account-avatar"><UserRound size={25}/></div><div><b>Gabung bersama komunitas</b><p>Buat akun untuk memulai obrolan dan berbagi pengalaman.</p></div><button className="button button-dark" onClick={() => openAuth(true)}>Daftar</button></article>}
      </section> :
      section === 'Tentang' ? <section className="content-section"><span className="eyebrow">TENTANG KAMI</span><h2>Komunitas tumbuh dari percakapan.</h2><p>SL Community adalah ruang digital untuk berbagi informasi, berdiskusi, dan saling terhubung dengan positif.</p></section> :
      (section === 'Layanan' || section === 'Jelajahi') ? <section className="content-section explore-section"><span className="eyebrow">JELAJAHI</span><h2>Ada ruang untuk idemu.</h2><p>Temukan topik dan mulai percakapan yang bermanfaat.</p><div className="service-grid"><article>💬<h3>Obrolan bersama</h3><p>Berbagi cerita dan berdiskusi dengan anggota.</p></article><article>📚<h3>Berbagi informasi</h3><p>Temukan pengalaman yang bermanfaat.</p></article><article>🤝<h3>Bangun koneksi</h3><p>Tumbuhkan relasi positif bersama.</p></article></div><button className="button button-dark" onClick={() => setSection('Obrolan')}>Buka obrolan</button></section> :
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
      <button className={section === 'Jelajahi' ? 'bottom-nav-item active' : 'bottom-nav-item'} onClick={() => setSection('Jelajahi')} aria-current={section === 'Jelajahi' ? 'page' : undefined}><Compass size={20}/><span>Jelajahi</span></button>
      <button className={section === 'Obrolan' ? 'bottom-nav-item active' : 'bottom-nav-item'} onClick={() => { setSection('Obrolan'); document.getElementById('community-feed')?.scrollIntoView({behavior:'smooth'}); }} aria-current={section === 'Obrolan' ? 'page' : undefined}><MessageCircle size={20}/><span>Obrolan</span></button>
      <button className={section === 'Akun' ? 'bottom-nav-item active' : 'bottom-nav-item'} onClick={() => setSection('Akun')} aria-current={section === 'Akun' ? 'page' : undefined}><UserRound size={20}/><span>Akun</span></button>
    </nav>
    <footer><span className="footer-brand"><Sparkles size={16}/> SL COMMUNITY</span><span>Ruang digital untuk saling terhubung.</span><small>© {new Date().getFullYear()} SL Community Platform</small></footer>
  </div>;
}