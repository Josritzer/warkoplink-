import { useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { FILTER_TOPICS, MAX_POST_LENGTH, POST_SUBTYPES, POST_TOPICS } from '../lib.js';
import ChatPostCard from './ChatPostCard.jsx';

// Komposisi UI panel; sumber data dan aksi tetap dari App agar alur reaksi/komentar tidak berubah.
export default function ChatPanel(props) {
  const {
    user, firebaseConfigured, search, setSearch, topic, setTopic, composerTopic, setComposerTopic, composerOpen, setComposerOpen, readOnly = false, onOpenDiscussion,
    openAuth, setNotice, draft, setDraft, activeCategory, handlePost, posting,
    postsStatus, setPostsRetry, visiblePosts, cardProps, hasMorePosts, loadingMorePosts, loadMoreError, onLoadMorePosts
  } = props;
  const [postType, setPostType] = useState(POST_SUBTYPES[composerTopic]?.[0] || '');
  const [location, setLocation] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [price, setPrice] = useState('');
  const [workType, setWorkType] = useState('');
  const [contact, setContact] = useState('');
  const category = composerTopic || POST_TOPICS[0];
  const showDate = category === 'Info & Acara' || category === 'Ngopi Bareng';
  const showPrice = category === 'Jual Beli & Jasa Lokal';
  const showWorkType = category === 'Loker';
  const showContact = category === 'Jual Beli & Jasa Lokal' || category === 'Loker';

  return <section className="content-section" id="community-feed">
    <div className="section-heading"><div><span className="eyebrow">RUANG BERSAMA</span><h2>Obrolan komunitas</h2><p>Satu percakapan bisa jadi awal dari hal baik.</p></div><span className={user ? 'status-pill status-authenticated' : 'status-pill status-public'} role="status" aria-live="polite">{user ? 'Masuk sebagai ' + (user.displayName || user.email) : 'Baca obrolan publik'}</span></div>
    {!firebaseConfigured && <p className="config-warning" role="status">Firebase belum tersambung. Kode integrasi siap; konfigurasi proyek diperlukan untuk mengaktifkan akun dan database.</p>}
    <div className="feed-tools"><label className="search"><span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder={`Cari di ${topic === 'Semua' ? 'semua obrolan' : topic}…`} aria-label={`Cari di ${topic === 'Semua' ? 'semua obrolan' : topic}`}/></label></div>
    <div className="topic-scroll-wrap"><div className="topic-list" aria-label="Kategori obrolan">{FILTER_TOPICS.map(name => <button key={name} type="button" onClick={() => setTopic(name)} aria-pressed={topic === name} className={topic === name ? 'topic selected' : 'topic'}>{name}</button>)}</div><span className="topic-scroll-hint" aria-hidden="true">›</span></div>
    {readOnly ? <div className="feed-readonly-note"><span>Beranda · mode baca</span><button className="button button-quiet" type="button" onClick={onOpenDiscussion}>Mulai obrolan di menu Obrolan <Send size={14}/></button></div> :
    <form className={composerOpen ? "composer composer-expanded" : "composer composer-collapsed"} onSubmit={event => handlePost(event, { postType, location, eventDate, price, workType, contact })} aria-busy={posting}>
      {!composerOpen ? <button type="button" className="composer-trigger" onClick={() => { if (!user) { openAuth(false); setNotice("Masuk untuk mulai berbagi obrolan."); return; } setComposerOpen(true); }}><span className="composer-avatar">{user?.photoURL ? <img src={user.photoURL} alt="" /> : String(user?.displayName || user?.email || "S").slice(0,1).toUpperCase()}</span><span>{user ? "Ayo ngobrol…" : "Masuk untuk mulai ngobrol…"}</span></button> : <>
        <div className="composer-context"><span className="composer-avatar">{user?.photoURL ? <img src={user.photoURL} alt="" /> : String(user?.displayName || user?.email || "S").slice(0,1).toUpperCase()}</span><div><b>{user?.displayName || "Anggota komunitas"}</b><small>Posting ke <strong>{activeCategory}</strong></small></div></div>
        <label className="composer-field">Kategori utama
          <select aria-label="Kategori posting" value={category} onChange={event => { setComposerTopic(event.target.value); setPostType(POST_SUBTYPES[event.target.value]?.[0] || ''); }}>
            {POST_TOPICS.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="composer-field">Jenis posting
          <select aria-label="Jenis posting" value={postType} onChange={event => setPostType(event.target.value)}>
            {(POST_SUBTYPES[category] || []).map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <textarea aria-label="Isi obrolan" autoFocus value={draft} onChange={event => setDraft(event.target.value)} maxLength={MAX_POST_LENGTH} placeholder="Ceritakan hal yang ingin dibagikan…" rows={3} aria-describedby="composer-character-count"/>
        {['Ngopi Bareng', 'Tanya Warkop', 'Info & Acara', 'Loker', 'Jual Beli & Jasa Lokal'].includes(category) && <label className="composer-field">Area / lokasi (opsional)<input value={location} onChange={event => setLocation(event.target.value)} maxLength={160} placeholder="Desa, kecamatan, atau nama warkop"/></label>}
        {showDate && <label className="composer-field">Waktu / tanggal (opsional)<input value={eventDate} onChange={event => setEventDate(event.target.value)} maxLength={40} placeholder="Contoh: Sabtu, 19.00 WIB"/></label>}
        {showPrice && <label className="composer-field">Harga (opsional)<input value={price} onChange={event => setPrice(event.target.value)} maxLength={60} placeholder="Contoh: Rp50.000, bisa nego"/></label>}
        {showWorkType && <label className="composer-field">Tipe kerja (opsional)<input value={workType} onChange={event => setWorkType(event.target.value)} maxLength={60} placeholder="Penuh waktu, paruh waktu, shift"/></label>}
        {showContact && <label className="composer-field">Kontak aman (opsional)<input value={contact} onChange={event => setContact(event.target.value)} maxLength={240} placeholder="https://… atau @akun"/></label>}
        <div className="composer-bottom"><small id="composer-character-count" className="char-count" aria-live="polite">{draft.length}/{MAX_POST_LENGTH}</small><button className="button button-quiet" type="button" onClick={() => { setComposerOpen(false); setDraft(""); setLocation(''); setEventDate(''); setPrice(''); setWorkType(''); setContact(''); }} disabled={posting}>Batal</button><button className="button button-dark" type="submit" disabled={posting || !draft.trim()} aria-busy={posting}>{posting ? "Mengirim…" : "Kirim"} <Send size={16}/></button></div>
      </>}
    </form>}
    <div className="post-list" aria-live="polite" aria-busy={postsStatus === 'loading'}>
      {postsStatus === 'loading' && <div className="empty-state" role="status"><h3>Memuat obrolan…</h3><p>Mohon tunggu sebentar.</p></div>}
      {postsStatus === 'error' && <div className="empty-state" role="alert"><h3>Obrolan belum dapat dimuat</h3><p>Periksa koneksi internet Anda lalu coba lagi.</p><button className="button button-dark" type="button" onClick={() => setPostsRetry(n => n + 1)}>Coba lagi</button></div>}
      {postsStatus === 'ready' && visiblePosts.map(post => <ChatPostCard key={post.id} post={post} {...cardProps}/>)}
      {postsStatus === 'ready' && visiblePosts.length === 0 && <div className="empty-state" role="status"><span><MessageCircle size={24}/></span><h3>{search ? 'Belum ada hasil pencarian' : topic !== 'Semua' ? 'Belum ada obrolan di topik ini' : 'Belum ada obrolan'}</h3><p>{search ? 'Coba kata kunci yang berbeda.' : 'Jadilah yang pertama memulai obrolan komunitas.'}</p></div>}
    </div>
    {postsStatus === 'ready' && hasMorePosts && <div className="feed-pagination">
      {loadMoreError && <p className="form-error" role="alert">{loadMoreError}</p>}
      <button className="button button-quiet" type="button" onClick={onLoadMorePosts} disabled={loadingMorePosts} aria-busy={loadingMorePosts}>
        {loadingMorePosts ? 'Memuat obrolan…' : 'Muat obrolan lebih lama'}
      </button>
    </div>}
  </section>;
}
