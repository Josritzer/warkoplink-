import { useEffect, useRef, useState } from 'react';
import { collection, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { Heart, X } from 'lucide-react';
import { db } from '../firebase.js';

function initial(name) {
  return String(name || 'W').trim().slice(0, 1).toLocaleUpperCase('id-ID') || 'W';
}

function Avatar({ profile, size = 'small' }) {
  return <span className={`liker-avatar liker-avatar-${size}`} aria-hidden="true">
    {profile?.photoURL
      ? <img src={profile.photoURL} alt="" loading="lazy" />
      : <span>{initial(profile?.displayName)}</span>}
  </span>;
}

async function fetchPublicProfiles(uids) {
  if (!db || !uids.length) return [];
  const unique = [...new Set(uids)].slice(0, 10);
  const snapshot = await getDocs(query(collection(db, 'publicProfiles'), where('uid', 'in', unique)));
  const byUid = new Map(snapshot.docs.map(item => [item.id, { uid: item.id, ...item.data() }]));
  return unique.map(uid => byUid.get(uid)).filter(profile => profile && profile.displayName);
}

export default function LikeSummary({ post, user, liked, count, onToggleLike, openAuth, setNotice }) {
  const [preview, setPreview] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [likers, setLikers] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const dialogRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!db || !post?.id || count < 1) { setPreview([]); return undefined; }
    let active = true;
    const stop = onSnapshot(
      query(collection(db, 'posts', post.id, 'likes'), orderBy('createdAt', 'desc'), limit(3)),
      async snapshot => {
        try {
          const profiles = await fetchPublicProfiles(snapshot.docs.map(item => item.id));
          if (active) setPreview(profiles.slice(0, 3));
        } catch {
          if (active) setPreview([]);
        }
      },
      () => { if (active) setPreview([]); }
    );
    return () => { active = false; stop(); };
  }, [post?.id, count]);

  useEffect(() => {
    if (!dialogOpen) return undefined;
    closeRef.current?.focus();
    const onKeyDown = event => {
      if (event.key === 'Escape') setDialogOpen(false);
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dialogOpen]);

  async function loadLikers(reset = false) {
    if (!db || !post?.id || loading) return;
    setLoading(true);
    setListError('');
    try {
      const base = collection(db, 'posts', post.id, 'likes');
      const pageQuery = query(base, orderBy('createdAt', 'desc'), ...(reset || !cursor ? [] : [/* cursor is applied below */]), limit(10));
      // Cursor pagination is explicit so no page reads more than ten like documents.
      const { startAfter } = await import('firebase/firestore');
      const snapshot = await getDocs(reset || !cursor ? pageQuery : query(base, orderBy('createdAt', 'desc'), startAfter(cursor), limit(10)));
      const profiles = await fetchPublicProfiles(snapshot.docs.map(item => item.id));
      setLikers(current => {
        const next = reset ? profiles : [...current, ...profiles.filter(profile => !current.some(old => old.uid === profile.uid))];
        return next;
      });
      setCursor(snapshot.docs.at(-1) || null);
      setHasMore(snapshot.docs.length === 10);
    } catch {
      setListError('Daftar penyuka belum dapat dimuat. Periksa koneksi lalu coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  async function openLikerList() {
    if (!user) {
      openAuth(false);
      setNotice('Masuk untuk melihat daftar pengguna yang menyukai postingan ini.');
      return;
    }
    setDialogOpen(true);
    setLikers([]);
    setCursor(null);
    setHasMore(false);
    await loadLikers(true);
  }

  return <>
    <div className="like-summary" aria-label="Ringkasan suka">
      {count > 0 && <button className="like-people-preview" type="button" onClick={openLikerList} aria-label={`Lihat ${count} pengguna yang menyukai postingan`}>
        <span className="like-avatar-stack">{preview.map(profile => <Avatar key={profile.uid} profile={profile}/>)}</span>
        <span className="like-count">{count} {count === 1 ? 'suka' : 'suka'}</span>
      </button>}
      <button className={liked ? 'post-action liked like-toggle' : 'post-action like-toggle'} type="button" aria-pressed={Boolean(liked)} aria-label={liked ? 'Batalkan suka pada postingan' : 'Sukai postingan'} onClick={onToggleLike}>
        <Heart size={17} fill={liked ? 'currentColor' : 'none'} aria-hidden="true" />
        <span>{liked ? 'Disukai' : 'Suka'}</span>
      </button>
    </div>
    {dialogOpen && <div className="liker-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setDialogOpen(false); }}>
      <section className="liker-dialog" role="dialog" aria-modal="true" aria-labelledby={`liker-title-${post.id}`} ref={dialogRef}>
        <header className="liker-dialog-header"><h2 id={`liker-title-${post.id}`}>Disukai oleh</h2><button ref={closeRef} className="liker-dialog-close" type="button" aria-label="Tutup daftar penyuka" onClick={() => setDialogOpen(false)}><X size={20}/></button></header>
        <div className="liker-dialog-list" aria-live="polite">
          {likers.map(profile => <div className="liker-row" key={profile.uid}><Avatar profile={profile} size="large"/><span>{profile.displayName}</span></div>)}
          {loading && <p className="liker-state" role="status">Memuat penyuka…</p>}
          {!loading && !likers.length && !listError && <p className="liker-state">Belum ada profil publik yang dapat ditampilkan.</p>}
          {listError && <div className="liker-state" role="alert"><p>{listError}</p><button className="button button-quiet" type="button" onClick={() => loadLikers(true)}>Coba lagi</button></div>}
        </div>
        {hasMore && <button className="button button-quiet liker-load-more" type="button" disabled={loading} onClick={() => loadLikers(false)}>{loading ? 'Memuat…' : 'Muat lebih banyak'}</button>}
      </section>
    </div>}
  </>;
}
