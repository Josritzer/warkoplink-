import { useEffect, useState } from 'react';
import { ArrowLeft, MessageCircle, UserRound } from 'lucide-react';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { isPublicPost } from '../lib.js';

function postDate(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export default function PublicUserProfile({ profile: fallbackProfile, db, onBack }) {
  const uid = fallbackProfile?.uid || '';
  const [profile, setProfile] = useState(fallbackProfile || null);
  const [posts, setPosts] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (!db || !uid) { setStatus('error'); return undefined; }
    let active = true;
    async function load() {
      setStatus('loading');
      try {
        const [profileSnapshot, postsSnapshot] = await Promise.all([
          getDoc(doc(db, 'publicProfiles', uid)),
          getDocs(query(collection(db, 'posts'), where('authorId', '==', uid), limit(20)))
        ]);
        if (!active) return;
        if (profileSnapshot.exists()) {
          const data = profileSnapshot.data() || {};
          setProfile({ uid, displayName: data.displayName || fallbackProfile?.displayName || 'Anggota WarkopLink', photoURL: data.photoURL || '' });
        } else {
          setProfile(fallbackProfile || { uid, displayName: 'Anggota WarkopLink', photoURL: '' });
        }
        const rows = postsSnapshot.docs
          .map(item => ({ id: item.id, ...item.data() }))
          .filter(isPublicPost)
          .sort((a, b) => {
            const time = value => value?.toMillis ? value.toMillis() : new Date(value || 0).getTime();
            return time(b.createdAt) - time(a.createdAt);
          });
        setPosts(rows);
        setStatus('ready');
      } catch {
        if (active) setStatus('error');
      }
    }
    load();
    return () => { active = false; };
  }, [db, uid]);

  const name = profile?.displayName || fallbackProfile?.displayName || 'Anggota WarkopLink';
  return <div className="public-profile-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onBack(); }}>
    <section className="public-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="public-profile-title">
      <header className="public-profile-header">
        <button type="button" className="public-profile-back" onClick={onBack} aria-label="Kembali ke daftar penyuka"><ArrowLeft size={19}/></button>
        <h2 id="public-profile-title">Profil pengguna</h2>
        <span aria-hidden="true" className="public-profile-header-spacer"/>
      </header>
      <div className="public-profile-identity">
        <div className="public-profile-avatar">
          {profile?.photoURL ? <img src={profile.photoURL} alt="" /> : <UserRound size={30}/>}
        </div>
        <div><h3>{name}</h3><p>Anggota komunitas WarkopLink</p></div>
      </div>
      <div className="public-profile-posts">
        <div className="public-profile-section-title"><h3>Postingan</h3><span>{posts.length}</span></div>
        {status === 'loading' && <p className="public-profile-state" role="status">Memuat profil dan postingan…</p>}
        {status === 'error' && <p className="public-profile-state" role="alert">Profil belum dapat dimuat. Periksa koneksi lalu coba lagi.</p>}
        {status === 'ready' && posts.length === 0 && <p className="public-profile-state">Belum ada postingan publik.</p>}
        {status === 'ready' && posts.map(post => <article className="public-profile-post" key={post.id}>
          <div className="public-profile-post-meta"><span>{post.topic || 'Ngopi Bareng'}</span><time>{postDate(post.createdAt)}</time></div>
          <p>{post.body}</p>
          <small><MessageCircle size={13}/> {Number(post.commentCount || 0)} komentar</small>
        </article>)}
      </div>
      <p className="public-profile-privacy">Hanya informasi profil publik dan postingan publik yang ditampilkan. Email dan data pribadi tidak dibuka.</p>
    </section>
  </div>;
}
