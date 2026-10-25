import { MessageCircle, Send } from 'lucide-react';
import { FILTER_TOPICS, MAX_POST_LENGTH } from '../lib.js';
import ChatPostCard from './ChatPostCard.jsx';

// Komposisi UI panel; sumber data dan aksi tetap dari App agar alur reaksi/komentar tidak berubah.
export default function ChatPanel(props) {
  const {
    user, firebaseConfigured, search, setSearch, topic, setTopic, composerOpen, setComposerOpen, readOnly = false, onOpenDiscussion,
    openAuth, setNotice, draft, setDraft, activeCategory, handlePost, posting,
    postsStatus, setPostsRetry, visiblePosts, cardProps, hasMorePosts, loadingMorePosts, loadMoreError, onLoadMorePosts
  } = props;

  return <section className="content-section" id="community-feed">
    <div className="section-heading"><div><span className="eyebrow">RUANG BERSAMA</span><h2>Obrolan komunitas</h2><p>Satu percakapan bisa jadi awal dari hal baik.</p></div><span className="status-pill">{user ? 'Masuk sebagai ' + (user.displayName || user.email) : 'Baca obrolan publik'}</span></div>
    {!firebaseConfigured && <p className="config-warning">Firebase belum tersambung. Kode integrasi siap; konfigurasi proyek diperlukan untuk mengaktifkan akun dan database.</p>}
    <div className="feed-tools"><label className="search"><span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder={`Cari di ${topic === 'Semua' ? 'semua obrolan' : topic}…`} aria-label={`Cari di ${topic === 'Semua' ? 'semua obrolan' : topic}`}/></label></div>
    <div className="topic-scroll-wrap"><div className="topic-list" aria-label="Kategori obrolan">{FILTER_TOPICS.map(name => <button key={name} type="button" onClick={() => setTopic(name)} aria-pressed={topic === name} className={topic === name ? 'topic selected' : 'topic'}>{name}</button>)}</div><span className="topic-scroll-hint" aria-hidden="true">›</span></div>
    {readOnly ? <div className="feed-readonly-note"><span>Beranda · mode baca</span><button className="button button-quiet" type="button" onClick={onOpenDiscussion}>Mulai obrolan di menu Obrolan <Send size={14}/></button></div> :
    <form className={composerOpen ? "composer composer-expanded" : "composer composer-collapsed"} onSubmit={handlePost}>
      {!composerOpen ? <button type="button" className="composer-trigger" onClick={() => { if (!user) { openAuth(false); setNotice("Masuk untuk mulai berbagi obrolan."); return; } setComposerOpen(true); }}><span className="composer-avatar">{user?.photoURL ? <img src={user.photoURL} alt="" /> : String(user?.displayName || user?.email || "S").slice(0,1).toUpperCase()}</span><span>{user ? "Ayo ngobrol…" : "Masuk untuk mulai ngobrol…"}</span></button> : <>
        <div className="composer-context"><span className="composer-avatar">{user?.photoURL ? <img src={user.photoURL} alt="" /> : String(user?.displayName || user?.email || "S").slice(0,1).toUpperCase()}</span><div><b>{user?.displayName || "Anggota komunitas"}</b><small>Posting ke <strong>{activeCategory}</strong></small></div></div>
        <textarea aria-label="Isi obrolan" autoFocus value={draft} onChange={event => setDraft(event.target.value)} maxLength={MAX_POST_LENGTH} placeholder="Ayo ngobrol…" rows={3}/>
        <div className="composer-bottom"><small className="char-count" aria-live="polite">{draft.length}/{MAX_POST_LENGTH}</small><button className="button button-quiet" type="button" onClick={() => { setComposerOpen(false); setDraft(""); }}>Batal</button><button className="button button-dark" type="submit" disabled={posting || !draft.trim()}>{posting ? "Mengirim…" : "Kirim"} <Send size={16}/></button></div>
      </>}
    </form>}
    <div className="post-list">
      {postsStatus === 'loading' && <div className="empty-state" role="status"><h3>Memuat obrolan…</h3><p>Mohon tunggu sebentar.</p></div>}
      {postsStatus === 'error' && <div className="empty-state" role="alert"><h3>Obrolan belum dapat dimuat</h3><p>Periksa koneksi internet Anda lalu coba lagi.</p><button className="button button-dark" type="button" onClick={() => setPostsRetry(n => n + 1)}>Coba lagi</button></div>}
      {postsStatus === 'ready' && visiblePosts.map(post => <ChatPostCard key={post.id} post={post} {...cardProps}/>)}
      {postsStatus === 'ready' && visiblePosts.length === 0 && <div className="empty-state"><span><MessageCircle size={24}/></span><h3>{search ? 'Belum ada hasil pencarian' : topic !== 'Semua' ? 'Belum ada obrolan di topik ini' : 'Belum ada obrolan'}</h3><p>{search ? 'Coba kata kunci yang berbeda.' : 'Jadilah yang pertama memulai obrolan komunitas.'}</p></div>}
    </div>
    {postsStatus === 'ready' && hasMorePosts && <div className="feed-pagination">
      {loadMoreError && <p className="form-error" role="alert">{loadMoreError}</p>}
      <button className="button button-quiet" type="button" onClick={onLoadMorePosts} disabled={loadingMorePosts}>
        {loadingMorePosts ? 'Memuat obrolan…' : 'Muat obrolan lebih lama'}
      </button>
    </div>}
  </section>;
}
