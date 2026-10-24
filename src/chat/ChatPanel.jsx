import { MessageCircle } from 'lucide-react';
import { FILTER_TOPICS, MAX_POST_LENGTH, POSTS_LIMIT, POST_TOPICS, POST_WARN_AT } from '../lib.js';
import PostCard from './PostCard.jsx';
import { useMinuteClock } from './hooks.js';

// Tampilan panel obrolan. Semua data dan aksi datang dari `chat` (lihat useChatController).
export default function ChatPanel({ chat, user, firebaseConfigured }) {
  const now = useMinuteClock();
  const nearLimit = chat.draft.length >= POST_WARN_AT;
  const searching = chat.search.trim().length > 0;
  const submitDisabled = chat.posting || chat.cooldownRemaining > 0;

  function handleDraftKeyDown(event) {
    // Ctrl/Cmd+Enter mengirim; Enter biasa tetap membuat baris baru.
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) chat.submitPost(event);
  }

  return <section className="content-section" id="community-feed">
    <div className="section-heading">
      <div><span className="eyebrow">RUANG BERSAMA</span><h2>Obrolan komunitas</h2><p>Satu percakapan bisa jadi awal dari hal baik.</p></div>
      <span className="status-pill">{user ? 'Masuk sebagai ' + (user.displayName || user.email) : 'Baca obrolan publik'}</span>
    </div>
    {!firebaseConfigured && <p className="config-warning">Firebase belum tersambung. Kode integrasi siap; konfigurasi proyek diperlukan untuk mengaktifkan akun dan database.</p>}
    <div className="feed-tools">
      <label className="search"><span>⌕</span><input value={chat.search} onChange={(event) => chat.setSearch(event.target.value)} placeholder="Cari obrolan…" aria-label="Cari obrolan"/></label>
    </div>
    <div className="topic-list">
      {FILTER_TOPICS.map((name) => <button key={name} type="button" onClick={() => chat.setTopic(name)} aria-pressed={chat.topic === name} className={chat.topic === name ? 'topic selected' : 'topic'}>{name}</button>)}
    </div>
    <form className="composer" onSubmit={chat.submitPost}>
      <textarea aria-label="Isi obrolan" value={chat.draft} onChange={(event) => chat.setDraft(event.target.value)} onKeyDown={handleDraftKeyDown} maxLength={MAX_POST_LENGTH} placeholder={user ? 'Apa yang ingin kamu bagikan hari ini?' : 'Masuk untuk mulai berbagi obrolan…'} rows={3}/>
      <div className="composer-bottom">
        <select aria-label="Kategori obrolan" value={chat.composerTopic} onChange={(event) => chat.setComposerTopic(event.target.value)}>
          {POST_TOPICS.map((name) => <option key={name}>{name}</option>)}
        </select>
        <small className="composer-hint">Ctrl+Enter untuk mengirim</small>
        <small className={nearLimit ? 'char-count near-limit' : 'char-count'} aria-live={nearLimit ? 'polite' : 'off'}>{chat.draft.length}/{MAX_POST_LENGTH}</small>
        <button className="button button-dark" type="submit" disabled={submitDisabled}>{chat.posting ? 'Mengirim…' : chat.cooldownRemaining > 0 ? `Tunggu ${chat.cooldownRemaining} dtk` : 'Mulai obrolan'} <MessageCircle size={16}/></button>
      </div>
    </form>
    <div className="post-list">
      {chat.status === 'loading' && <div className="empty-state" role="status"><h3>Memuat obrolan…</h3><p>Mohon tunggu sebentar.</p></div>}
      {chat.status === 'error' && <div className="empty-state" role="alert"><h3>Obrolan belum dapat dimuat</h3><p>Periksa koneksi internet Anda lalu coba lagi.</p><button className="button button-dark" type="button" onClick={chat.reload}>Coba lagi</button></div>}
      {chat.status === 'ready' && chat.visiblePosts.map((post) => <PostCard key={post.id} post={post} user={user} chat={chat} now={now}/>)}
      {chat.status === 'ready' && chat.visiblePosts.length === 0 && <div className="empty-state"><span><MessageCircle size={24}/></span><h3>{searching ? 'Belum ada hasil pencarian' : chat.topic !== 'Semua' ? 'Belum ada obrolan di topik ini' : 'Belum ada obrolan'}</h3><p>{searching ? 'Coba kata kunci yang berbeda.' : 'Jadilah yang pertama memulai obrolan komunitas.'}</p></div>}
      {chat.status === 'ready' && chat.totalPosts >= POSTS_LIMIT && <p className="feed-limit-note">Menampilkan {POSTS_LIMIT} obrolan terbaru.</p>}
    </div>
  </section>;
}
