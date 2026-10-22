import { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword,
  signOut, updateProfile
} from 'firebase/auth';
import {
  addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc
} from 'firebase/firestore';
import { auth, db, firebaseConfigured } from './firebase.js';
import { MessageCircle, Users, BookOpen, Sparkles, ShieldCheck, Heart, ArrowUpRight, LogOut } from 'lucide-react';

const topics = ['Semua', 'Obrolan Umum', 'Tanya Jawab', 'Info Layanan', 'Ide & Saran'];

export default function App() {
  const [section, setSection] = useState('Obrolan');
  const [topic, setTopic] = useState('Semua');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [authOpen, setAuthOpen] = useState(false);
  const [registerMode, setRegisterMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!auth) return undefined;
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!db) return undefined;
    const postsQuery = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    return onSnapshot(postsQuery, (snapshot) => {
      setPosts(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    }, (error) => setNotice('Gagal memuat obrolan: ' + error.message));
  }, []);

  async function handleAuth(event) {
    event.preventDefault();
    if (!auth || !db) {
      setNotice('Firebase belum dikonfigurasi. Isi variabel VITE_FIREBASE_* terlebih dahulu.');
      return;
    }
    setBusy(true);
    try {
      if (registerMode) {
        const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const name = displayName.trim();
        await updateProfile(result.user, { displayName: name });
        await setDoc(doc(db, 'profiles', result.user.uid), {
          displayName: name, email: result.user.email, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
        setUser({ ...result.user, displayName: name });
        setNotice('Akun berhasil dibuat. Selamat bergabung!');
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        setNotice('Berhasil masuk ke SL Community.');
      }
      setAuthOpen(false);
      setEmail('');
      setPassword('');
      setDisplayName('');
    } catch (error) {
      const messages = {
        'auth/email-already-in-use': 'Email ini sudah terdaftar.',
        'auth/invalid-email': 'Format email tidak valid.',
        'auth/weak-password': 'Kata sandi minimal 6 karakter.',
        'auth/invalid-credential': 'Email atau kata sandi salah.',
        'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi nanti.'
      };
      setNotice(messages[error.code] || 'Autentikasi gagal: ' + error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePost(event) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return setNotice('Tulis pesan terlebih dahulu.');
    if (!user) {
      setAuthOpen(true);
      setNotice('Masuk atau buat akun terlebih dahulu untuk mengirim obrolan.');
      return;
    }
    if (!db) return setNotice('Firebase belum dikonfigurasi.');
    try {
      await addDoc(collection(db, 'posts'), {
        authorId: user.uid,
        authorName: user.displayName || user.email?.split('@')[0] || 'Anggota',
        body,
        topic: topic === 'Semua' ? 'Obrolan Umum' : topic,
        createdAt: serverTimestamp()
      });
      setDraft('');
      setNotice('Obrolan berhasil dipublikasikan.');
    } catch (error) {
      setNotice('Pesan belum terkirim: ' + error.message);
    }
  }

  async function handleSignOut() {
    if (!auth) return;
    try {
      await signOut(auth);
      setNotice('Anda sudah keluar dari akun.');
    } catch (error) {
      setNotice('Gagal keluar: ' + error.message);
    }
  }

  const visiblePosts = posts.filter((post) =>
    (topic === 'Semua' || post.topic === topic) &&
    (String(post.body || '').toLowerCase().includes(search.toLowerCase()) ||
      String(post.authorName || '').toLowerCase().includes(search.toLowerCase()))
  );

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setSection('Obrolan'); }}>
        <span className="brand-mark"><Sparkles size={22}/></span>
        <span><strong>SL COMMUNITY</strong><small>Tempat terhubung & bertumbuh</small></span>
      </a>
      <nav aria-label="Navigasi utama">{['Obrolan', 'Layanan', 'Tentang'].map(item =>
        <button key={item} className={section === item ? 'nav-link active' : 'nav-link'} onClick={() => setSection(item)}>{item}</button>
      )}</nav>
      {user ? <button className="button button-dark" onClick={handleSignOut}><LogOut size={15}/> Keluar</button> :
        <button className="button button-dark" onClick={() => { setAuthOpen(true); setRegisterMode(false); }}>Masuk</button>}
    </header>

    <main>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow"><i/> RUANG KOMUNITAS DIGITAL</span>
          <h1>Lebih dekat.<br/><em>Bertumbuh bersama.</em></h1>
          <p>Ruang untuk berbagi cerita, mencari jawaban, dan membangun hubungan positif bersama komunitas SL.</p>
          <div className="hero-actions">
            <button className="button button-light" onClick={() => document.getElementById('community-feed')?.scrollIntoView({behavior:'smooth'})}>Jelajahi obrolan <ArrowUpRight size={17}/></button>
            <button className="button button-outline" onClick={() => { setAuthOpen(true); setRegisterMode(true); }}>Gabung komunitas</button>
          </div>
          <div className="hero-proof"><ShieldCheck size={20}/><span><b>Komunitas yang saling menghargai</b><small>Jaga percakapan tetap ramah dan bermanfaat.</small></span></div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-orbit orbit-a"/><div className="art-orbit orbit-b"/>
          <div className="people"><span className="person person-a">☺</span><span className="person person-b">☺</span><span className="person person-c">☺</span></div>
          <div className="floating-card card-a">💡 <span><b>Ide baru</b><small>Mulai dari obrolan</small></span></div>
          <div className="chat-bubble bubble-a">Halo, komunitas! <Heart size={14}/></div>
          <div className="floating-card card-b"><i/> <span><b>Ruang bersama</b><small>Ide · Cerita · Dukungan</small></span></div>
        </div>
      </section>

      <section className="trust-row">
        <div><Users/><span><b>Terhubung bersama</b><small>Kenali komunitas</small></span></div>
        <div><MessageCircle/><span><b>Diskusi bermakna</b><small>Saling bantu dan berbagi</small></span></div>
        <div><BookOpen/><span><b>Informasi bermanfaat</b><small>Belajar dari pengalaman</small></span></div>
      </section>

      {section === 'Tentang' ? <section className="content-section"><span className="eyebrow">TENTANG KAMI</span><h2>Komunitas tumbuh dari percakapan.</h2><p>SL Community adalah ruang digital untuk berbagi informasi, berdiskusi, dan saling terhubung dengan positif.</p></section> :
      section === 'Layanan' ? <section className="content-section"><span className="eyebrow">JELAJAHI</span><h2>Ada ruang untuk idemu.</h2><div className="service-grid"><article>💬<h3>Obrolan bersama</h3><p>Berbagi cerita dan berdiskusi dengan anggota.</p></article><article>📚<h3>Berbagi informasi</h3><p>Temukan pengalaman yang bermanfaat.</p></article><article>🤝<h3>Bangun koneksi</h3><p>Tumbuhkan relasi positif bersama.</p></article></div><button className="button button-dark" onClick={() => setSection('Obrolan')}>Buka obrolan</button></section> :
      <section className="content-section" id="community-feed">
        <div className="section-heading"><div><span className="eyebrow">RUANG BERSAMA</span><h2>Obrolan komunitas</h2><p>Satu percakapan bisa jadi awal dari hal baik.</p></div><span className="status-pill">{user ? 'Masuk sebagai ' + (user.displayName || user.email) : 'Baca obrolan publik'}</span></div>
        {!firebaseConfigured && <p className="config-warning">Firebase belum tersambung. Kode integrasi siap; konfigurasi proyek diperlukan untuk mengaktifkan akun dan database.</p>}
        <div className="feed-tools"><label className="search"><span>⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari obrolan…"/></label></div>
        <div className="topic-list">{topics.map(t => <button key={t} onClick={() => setTopic(t)} className={topic === t ? 'topic selected' : 'topic'}>{t}</button>)}</div>
        <form className="composer" onSubmit={handlePost}>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder={user ? 'Apa yang ingin kamu bagikan hari ini?' : 'Masuk untuk mulai berbagi obrolan…'} rows={3}/>
          <div className="composer-bottom"><select aria-label="Kategori obrolan" value={topic === 'Semua' ? 'Obrolan Umum' : topic} onChange={e => setTopic(e.target.value)}>{topics.slice(1).map(t => <option key={t}>{t}</option>)}</select><button className="button button-dark" type="submit">Mulai obrolan <MessageCircle size={16}/></button></div>
        </form>
        <div className="post-list">
          {visiblePosts.map(post => <article className="post-card" key={post.id}><div className="post-avatar">{String(post.authorName || 'A').slice(0,1).toUpperCase()}</div><div className="post-content"><div className="post-meta"><b>{post.authorName || 'Anggota SL'}</b><span>{post.topic || 'Obrolan Umum'}</span></div><p>{post.body}</p></div></article>)}
          {visiblePosts.length === 0 && <div className="empty-state"><span><MessageCircle size={24}/></span><h3>{search ? 'Belum ada hasil pencarian' : 'Belum ada obrolan'}</h3><p>{search ? 'Coba kata kunci yang berbeda.' : 'Jadilah yang pertama memulai obrolan komunitas.'}</p></div>}
        </div>
      </section>}
      {authOpen && <div className="modal-backdrop" role="presentation" onClick={() => setAuthOpen(false)}><section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setAuthOpen(false)} aria-label="Tutup">×</button>
        <span className="brand-mark"><Sparkles size={20}/></span><h2 id="auth-title">{registerMode ? 'Gabung komunitas' : 'Selamat datang kembali'}</h2><p>{registerMode ? 'Buat akun untuk mulai terhubung.' : 'Masuk untuk ikut dalam percakapan.'}</p>
        <form onSubmit={handleAuth}>
          {registerMode && <label>Nama tampilan<input value={displayName} onChange={e => setDisplayName(e.target.value)} minLength={2} maxLength={60} required placeholder="Nama kamu"/></label>}
          <label>Email<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="nama@email.com"/></label>
          <label>Kata sandi<input type="password" autoComplete={registerMode ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} minLength={6} required placeholder="Minimal 6 karakter"/></label>
          <button className="button button-dark auth-submit" type="submit" disabled={busy}>{busy ? 'Memproses…' : registerMode ? 'Buat akun' : 'Masuk'}</button>
        </form>
        <button className="switch-auth" onClick={() => setRegisterMode(!registerMode)}>{registerMode ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar'}</button>
      </section></div>}
      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Tutup">×</button></div>}
    </main>
    <footer><span className="footer-brand"><Sparkles size={16}/> SL COMMUNITY</span><span>Ruang digital untuk saling terhubung.</span><small>© {new Date().getFullYear()} SL Community Platform</small></footer>
  </div>;
}