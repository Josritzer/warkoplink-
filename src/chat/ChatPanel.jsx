import { useEffect, useState } from 'react';
import { Compass, MessageCircle, Send } from 'lucide-react';
import { FILTER_TOPICS, MAX_POST_LENGTH, POST_SUBTYPES, POST_TOPICS } from '../lib.js';
import ChatPostCard from './ChatPostCard.jsx';
import { validateImageFile } from '../media/imagePolicy.js';

// Komposisi UI panel; sumber data dan aksi tetap dari App agar alur reaksi/komentar tidak berubah.
export default function ChatPanel(props) {
  const {
    user, firebaseConfigured, search, setSearch, topic, setTopic, composerTopic, setComposerTopic, composerOpen, setComposerOpen, readOnly = false, onOpenDiscussion, onOpenDirectory,
    openAuth, setNotice, draft, setDraft, activeCategory, handlePost, posting,
    postsStatus, setPostsRetry, visiblePosts, cardProps, hasMorePosts, loadingMorePosts, loadMoreError, onLoadMorePosts, verifiedWarungs = [], ownVerifiedWarungs = []
  } = props;
  const [postType, setPostType] = useState(POST_SUBTYPES[composerTopic]?.[0] || '');
  const [location, setLocation] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventStartAt, setEventStartAt] = useState('');
  const [eventEndAt, setEventEndAt] = useState('');
  const [eventKind, setEventKind] = useState('Nobar');
  const [eventCapacity, setEventCapacity] = useState('');
  const [eventPosterFile, setEventPosterFile] = useState(null);
  const [eventWarungId, setEventWarungId] = useState('');
  const [eventPosterPreview, setEventPosterPreview] = useState('');
  const [price, setPrice] = useState('');
  const [workType, setWorkType] = useState('');
  const [contact, setContact] = useState('');
  useEffect(() => {
    if (!eventPosterFile) { setEventPosterPreview(''); return undefined; }
    const preview = URL.createObjectURL(eventPosterFile);
    setEventPosterPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [eventPosterFile]);
  const [nudgeDismissed, setNudgeDismissed] = useState(() => { try { return window.localStorage.getItem('warkoplink:composer-nudge-dismissed:v1') === '1'; } catch { return false; } });
  const startStory = () => { if (!user) { openAuth(false); setNotice('Masuk untuk mulai berbagi cerita.'); return; } setComposerTopic('Ngopi Bareng'); setPostType(POST_SUBTYPES['Ngopi Bareng']?.[0] || ''); setTopic('Semua'); if (onOpenDiscussion) onOpenDiscussion(); else setComposerOpen(true); setNotice('Ceritakan suasana warkop hari ini di obrolan komunitas.'); };
  const dismissNudge = () => { setNudgeDismissed(true); try { window.localStorage.setItem('warkoplink:composer-nudge-dismissed:v1', '1'); } catch {} };
  const mentionMatch = draft.match(/(?:^|\s)@([^@]*)$/);
  const mentionQuery = mentionMatch?.[1]?.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID') || '';
  const mentionSuggestions = mentionMatch
    ? verifiedWarungs.filter(warung => String(warung.name || warung.nameNormalized || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID').startsWith(mentionQuery)).slice(0, 5)
    : [];
  const category = composerTopic || POST_TOPICS[0];
  const showDate = category === 'Info & Acara' || category === 'Ngopi Bareng';
  const showPrice = category === 'Jual Beli & Jasa Lokal';
  const showWorkType = category === 'Loker';
  const showContact = category === 'Jual Beli & Jasa Lokal' || category === 'Loker';

  return <section className="content-section" id="community-feed">
    <div className="section-heading"><div><span className="eyebrow">RUANG BERSAMA</span><h2>Obrolan komunitas</h2><p>Satu percakapan bisa jadi awal dari hal baik.</p></div><span className={user ? 'status-pill status-authenticated' : 'status-pill status-public'} role="status" aria-live="polite">{user ? 'Masuk sebagai ' + (user.displayName || user.email) : 'Baca obrolan publik'}</span></div>
    {!readOnly && user && !nudgeDismissed && postsStatus === "ready" && !visiblePosts.some(post => post.authorId === user.uid || post.userId === user.uid) && <div className="composer-nudge"><span><b>Psst, coba sapa warga dulu yuk?</b><br/>Satu sapaan kecil bisa membuka obrolan seru.</span><div><button type="button" onClick={() => { setComposerOpen(true); dismissNudge(); }}>Mulai ngobrol</button><button type="button" className="nudge-dismiss" aria-label="Tutup saran" onClick={dismissNudge}>Nanti</button></div></div>}
    {!firebaseConfigured && <p className="config-warning" role="status">Firebase belum tersambung. Kode integrasi siap; konfigurasi proyek diperlukan untuk mengaktifkan akun dan database.</p>}
    <div className="feed-tools"><label className="search"><span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder={`Cari di ${topic === 'Semua' ? 'semua obrolan' : topic}…`} aria-label={`Cari di ${topic === 'Semua' ? 'semua obrolan' : topic}`}/></label></div>
    <div className="topic-scroll-wrap"><div className="topic-list" aria-label="Kategori obrolan">{FILTER_TOPICS.map(name => <button key={name} type="button" onClick={() => setTopic(name)} aria-pressed={topic === name} className={topic === name ? 'topic selected' : 'topic'}>{name}</button>)}</div><span className="topic-scroll-hint" aria-hidden="true">›</span></div>
    {readOnly ? <div className="feed-readonly-note"><span>Beranda · mode baca</span><button className="button button-quiet" type="button" onClick={onOpenDiscussion}>Mulai obrolan di menu Obrolan <Send size={14}/></button></div> :
    <form className={composerOpen ? "composer composer-expanded" : "composer composer-collapsed"} onSubmit={async event => { const posted = await handlePost(event, { postType, location, eventDate, eventStartAt, eventEndAt, eventKind, eventCapacity, eventPosterFile, eventWarungId, price, workType, contact }); if (posted) { setEventPosterFile(null); setEventWarungId(""); } }} aria-busy={posting}>
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
        <textarea aria-label="Isi obrolan" autoFocus value={draft} onChange={event => setDraft(event.target.value)} maxLength={MAX_POST_LENGTH} placeholder="Ceritakan hal yang ingin dibagikan… Gunakan @ untuk menyebut warkop" rows={3} aria-describedby="composer-character-count"/>
        {mentionSuggestions.length > 0 && <div className="mention-suggestions" role="listbox" aria-label="Warkop terverifikasi">
          <small>Sebut warkop terverifikasi</small>
          {mentionSuggestions.map(warung => <button key={warung.id} type="button" role="option" aria-selected="false" onClick={() => setDraft(current => current.replace(/@([^@]*)$/, `@${warung.name} `))}>
            <span className="mention-suggestion-mark">@</span><span><b>{warung.name}</b><small>{warung.address || 'Profil warkop terverifikasi'}</small></span>
          </button>)}
        </div>}
        {['Ngopi Bareng', 'Tanya Warkop', 'Info & Acara', 'Loker', 'Jual Beli & Jasa Lokal'].includes(category) && <label className="composer-field">Area / lokasi (opsional)<input value={location} onChange={event => setLocation(event.target.value)} maxLength={160} placeholder="Desa, kecamatan, atau nama warkop"/></label>}
        {showDate && category === 'Info & Acara' && <div className="event-detail-fields" aria-label="Detail acara">
          <label className="composer-field">Jenis acara
            <select aria-label="Jenis acara" value={eventKind} onChange={event => setEventKind(event.target.value)}>
              <option>Nobar</option><option>Musik</option><option>Turnamen</option><option>Komunitas</option><option>Promo warkop</option><option>Lainnya</option>
            </select>
          </label>
          <label className="composer-field">Mulai acara <input aria-label="Waktu mulai acara" type="datetime-local" value={eventStartAt} onChange={event => { setEventStartAt(event.target.value); if (!eventDate) setEventDate(event.target.value); }} /></label>
          <label className="composer-field">Selesai acara <input aria-label="Waktu selesai acara" type="datetime-local" min={eventStartAt || undefined} value={eventEndAt} onChange={event => setEventEndAt(event.target.value)} /></label>
          <label className="composer-field">Kapasitas peserta (opsional) <input aria-label="Kapasitas peserta" type="number" min="1" max="10000" value={eventCapacity} onChange={event => setEventCapacity(event.target.value)} placeholder="Contoh: 40" /></label>
          <label className="composer-field">Warkop penyelenggara
            <select aria-label="Warkop penyelenggara" value={eventWarungId} onChange={event => setEventWarungId(event.target.value)}>
              <option value="">Pilih warkop terverifikasi milik Anda</option>
              {ownVerifiedWarungs.map(warung => <option key={warung.id} value={warung.id}>{warung.name}</option>)}
            </select>
          </label>
          <label className="composer-field">Poster acara (opsional · JPG/PNG/WebP · maksimal 2 MiB)
            <input aria-label="Poster acara" type="file" accept="image/jpeg,image/png,image/webp" disabled={!ownVerifiedWarungs.length || posting} onChange={event => {
              const file = event.target.files?.[0] || null;
              const error = file ? validateImageFile(file) : '';
              if (error) { setNotice(error); setEventPosterFile(null); event.target.value = ''; return; }
              setEventPosterFile(file);
            }} />
          </label>
          {!ownVerifiedWarungs.length && <p className="composer-help">Poster dapat diunggah oleh pemilik warkop yang sudah terverifikasi. Daftarkan warkop dan tunggu verifikasi terlebih dahulu.</p>}
          {eventPosterPreview && <div className="event-poster-preview"><img src={eventPosterPreview} alt="Pratinjau poster acara"/><div><b>{eventPosterFile?.name}</b><button className="button button-quiet" type="button" onClick={() => setEventPosterFile(null)} disabled={posting}>Hapus poster</button></div></div>}
          <p className="composer-help">Isi tanggal dan jam agar peserta bisa menambahkan acara ke kalender HP.</p>
        </div>}
        {showDate && category !== 'Info & Acara' && <label className="composer-field">Waktu / tanggal (opsional)<input value={eventDate} onChange={event => setEventDate(event.target.value)} maxLength={40} placeholder="Contoh: Sabtu, 19.00 WIB"/></label>}
        {showPrice && <label className="composer-field">Harga (opsional)<input value={price} onChange={event => setPrice(event.target.value)} maxLength={60} placeholder="Contoh: Rp50.000, bisa nego"/></label>}
        {showWorkType && <label className="composer-field">Tipe kerja (opsional)<input value={workType} onChange={event => setWorkType(event.target.value)} maxLength={60} placeholder="Penuh waktu, paruh waktu, shift"/></label>}
        {showContact && <label className="composer-field">Kontak aman (opsional)<input value={contact} onChange={event => setContact(event.target.value)} maxLength={240} placeholder="https://… atau @akun"/></label>}
        <div className="composer-bottom"><small id="composer-character-count" className="char-count" aria-live="polite">{draft.length}/{MAX_POST_LENGTH}</small><button className="button button-quiet" type="button" onClick={() => { setComposerOpen(false); setDraft(""); setLocation(''); setEventDate(''); setEventStartAt(''); setEventEndAt(''); setEventKind('Nobar'); setEventCapacity(''); setEventPosterFile(null); setEventWarungId(''); setPrice(''); setWorkType(''); setContact(''); }} disabled={posting}>Batal</button><button className="button button-dark" type="submit" disabled={posting || !draft.trim()} aria-busy={posting}>{posting ? "Mengirim…" : "Kirim"} <Send size={16}/></button></div>
      </>}
    </form>}
    <div className="post-list" aria-live="polite" aria-busy={postsStatus === 'loading'}>
      {postsStatus === 'loading' && <div className="empty-state" role="status"><h3>Memuat obrolan…</h3><p>Mohon tunggu sebentar.</p></div>}
      {postsStatus === 'error' && <div className="empty-state" role="alert"><h3>Obrolan belum dapat dimuat</h3><p>Periksa koneksi internet Anda lalu coba lagi.</p><button className="button button-dark" type="button" onClick={() => setPostsRetry(n => n + 1)}>Coba lagi</button></div>}
      {postsStatus === 'ready' && visiblePosts.map(post => <ChatPostCard key={post.id} post={post} {...cardProps}/>)}
      {postsStatus === 'ready' && visiblePosts.length === 0 && <div className="empty-state empty-state-community" role="status"><svg className="empty-illustration" viewBox="0 0 120 96" role="img" aria-label="Ilustrasi cangkir kopi dan percakapan"><path d="M24 34h57v34a15 15 0 0 1-15 15H39a15 15 0 0 1-15-15z" fill="currentColor" opacity=".16"/><path d="M81 42h8a12 12 0 0 1 0 24h-8" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round"/><path d="M35 24c-7-8 5-10 0-18M53 24c-7-8 5-10 0-18M70 24c-7-8 5-10 0-18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><path d="M14 84h85" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".4"/><path d="M76 10h25a9 9 0 0 1 9 9v8a9 9 0 0 1-9 9H88l-9 8v-8h-3" fill="var(--wl-primary)" opacity=".85"/></svg><h3>{search ? "Belum ada hasil pencarian" : topic !== "Semua" ? "Belum ada obrolan di topik ini" : "Belum ada obrolan"}</h3><p>{search ? "Coba kata kunci yang berbeda." : "Warkop masih sepi, yuk mulai duluan. Temukan tempat ngopi atau sapa warga sekitar untuk memulai percakapan."}</p><div className="event-action-row"><button type="button" className="button button-dark" onClick={startStory}><MessageCircle size={16}/> Mulai obrolan</button><button type="button" className="button button-quiet" onClick={() => onOpenDirectory?.()}><Compass size={16}/> Cari warkop</button></div></div>}
    </div>
    {postsStatus === 'ready' && hasMorePosts && <div className="feed-pagination">
      {loadMoreError && <p className="form-error" role="alert">{loadMoreError}</p>}
      <button className="button button-quiet" type="button" onClick={onLoadMorePosts} disabled={loadingMorePosts} aria-busy={loadingMorePosts}>
        {loadingMorePosts ? 'Memuat obrolan…' : 'Muat obrolan lebih lama'}
      </button>
    </div>}
  </section>;
}
