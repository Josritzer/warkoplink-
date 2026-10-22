import { useState } from 'react';
import { MessageCircle, Users, BookOpen, Sparkles, ShieldCheck, Heart, ArrowUpRight } from 'lucide-react';

const topics = ['Semua', 'Obrolan Umum', 'Tanya Jawab', 'Info Layanan', 'Ide & Saran'];

export default function App() {
  const [section, setSection] = useState('Obrolan');
  const [topic, setTopic] = useState('Semua');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setSection('Obrolan'); }}>
        <span className="brand-mark"><Sparkles size={22}/></span>
        <span><strong>SL COMMUNITY</strong><small>Tempat terhubung & bertumbuh</small></span>
      </a>
      <nav aria-label="Navigasi utama">{['Obrolan', 'Layanan', 'Tentang'].map(item =>
        <button key={item} className={section === item ? 'nav-link active' : 'nav-link'} onClick={() => setSection(item)}>{item}</button>
      )}</nav>
      <button className="button button-dark" onClick={() => setNotice('Fitur akun akan diaktifkan pada tahap Firebase.')}>Masuk</button>
    </header>

    <main>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow"><i/> RUANG KOMUNITAS DIGITAL</span>
          <h1>Lebih dekat.<br/><em>Bertumbuh bersama.</em></h1>
          <p>Ruang untuk berbagi cerita, mencari jawaban, dan membangun hubungan positif bersama komunitas SL.</p>
          <div className="hero-actions">
            <button className="button button-light" onClick={() => document.getElementById('community-feed')?.scrollIntoView({behavior:'smooth'})}>Jelajahi obrolan <ArrowUpRight size={17}/></button>
            <button className="button button-outline" onClick={() => setNotice('Pendaftaran akun disiapkan pada tahap autentikasi.')}>Gabung komunitas</button>
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
        <div className="section-heading"><div><span className="eyebrow">RUANG BERSAMA</span><h2>Obrolan komunitas</h2><p>Satu percakapan bisa jadi awal dari hal baik.</p></div><span className="status-pill">Ruang komunitas</span></div>
        <div className="feed-tools"><label className="search"><span>⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari obrolan…"/></label></div>
        <div className="topic-list">{topics.map(t => <button key={t} onClick={() => setTopic(t)} className={topic === t ? 'topic selected' : 'topic'}>{t}</button>)}</div>
        <form className="composer" onSubmit={e => { e.preventDefault(); setNotice(draft.trim() ? 'Obrolan akan bisa dikirim setelah akun dan database dihubungkan.' : 'Tulis pesan terlebih dahulu.'); }}>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="Apa yang ingin kamu bagikan hari ini?" rows={3}/>
          <div className="composer-bottom"><select aria-label="Kategori obrolan">{topics.slice(1).map(t => <option key={t}>{t}</option>)}</select><button className="button button-dark" type="submit">Mulai obrolan <MessageCircle size={16}/></button></div>
        </form>
        <div className="empty-state"><span><MessageCircle size={24}/></span><h3>{search ? 'Belum ada hasil pencarian' : 'Jadilah yang memulai obrolan'}</h3><p>{search ? 'Coba kata kunci yang berbeda.' : 'Obrolan anggota akan tampil di sini setelah database komunitas dihubungkan.'}</p></div>
      </section>}
      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Tutup">×</button></div>}
    </main>
    <footer><span className="footer-brand"><Sparkles size={16}/> SL COMMUNITY</span><span>Ruang digital untuk saling terhubung.</span><small>© {new Date().getFullYear()} SL Community Platform</small></footer>
  </div>;
}