import { useEffect, useState } from 'react';
import { ArrowLeft, MessageCircle, UserRound, Pencil, CalendarDays } from 'lucide-react';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { isPublicPost } from '../lib.js';

function postDate(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export default function PublicUserProfile({ profile: fallbackProfile, db, currentUser, onBack, onEditProfile }) {
  const uid = fallbackProfile?.uid || '';
  const [profile, setProfile] = useState(fallbackProfile || null);
  const [posts, setPosts] = useState([]);
  const [status, setStatus] = useState('loading');
  const [activeTab, setActiveTab] = useState('Postingan');
  const isOwnProfile = Boolean(currentUser?.uid && currentUser.uid === uid);

  useEffect(() => {
    if (!db || !uid) { setStatus('error'); return undefined; }
    let active = true;
    async function load() {
      setStatus('loading');
      try {
        const [profileSnapshot, postsSnapshot] = await Promise.all([
          getDoc(doc(db, 'publicProfiles', uid)),
          getDocs(query(collection(db, 'posts'), where('authorId', '==', uid), limit(50)))
        ]);
        if (!active) return;
        if (profileSnapshot.exists()) {
          const data = profileSnapshot.data() || {};
          setProfile({
            uid,
            displayName: data.displayName || fallbackProfile?.displayName || 'Anggota WarkopLink',
            photoURL: data.photoURL || '',
            bio: typeof data.bio === 'string' ? data.bio : '',
            location: typeof data.location === 'string' ? data.location : ''
          });
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
  return <main className="member-profile-page" aria-label={`Profil ${name}`}>
    <header className="member-profile-topbar">
      <button type="button" className="member-profile-back" onClick={onBack} aria-label="Kembali"><ArrowLeft size={20}/></button>
      <div><strong>{name}</strong><small>{status === 'ready' ? `${posts.length} postingan publik` : 'Profil anggota'}</small></div>
      {isOwnProfile && <button type="button" className="button button-quiet member-profile-edit" onClick={onEditProfile}><Pencil size={15}/> Edit</button>}
    </header>
    <section className="member-profile-hero">
      <div className="member-profile-cover" aria-label="Sampul profil WarkopLink"><span>WARKOPLINK</span><small>Ruang cerita dan komunitas</small></div>
      <div className="member-profile-identity">
        <div className="member-profile-avatar">
          {profile?.photoURL ? <img src={profile.photoURL} alt={`Foto profil ${name}`} /> : <UserRound size={42}/>}
        </div>
        <div className="member-profile-name">
          <h1>{name}</h1>
          <p>{isOwnProfile ? 'Ini profil Anda' : 'Anggota komunitas WarkopLink'}</p>
        </div>
        {isOwnProfile && <button type="button" className="button button-dark member-profile-edit-mobile" onClick={onEditProfile}><Pencil size={15}/> Edit profil</button>}
      </div>
      <div className="member-profile-stats">
        <div><strong>{status === 'ready' ? posts.length : '—'}</strong><span>Postingan</span></div>
        <div><strong>WarkopLink</strong><span>Komunitas</span></div>
      </div>
      {(profile?.bio || profile?.location) && <div className="member-profile-bio">
        {profile.bio && <p>{profile.bio}</p>}
        {profile.location && <span><CalendarDays size={14}/> {profile.location}</span>}
      </div>}
    </section>
    <nav className="member-profile-tabs" aria-label="Navigasi profil">
      <button type="button" className={activeTab === 'Postingan' ? 'active' : ''} aria-current={activeTab === 'Postingan' ? 'page' : undefined} onClick={() => setActiveTab('Postingan')}>Postingan</button>
      <button type="button" className={activeTab === 'Tentang' ? 'active' : ''} aria-current={activeTab === 'Tentang' ? 'page' : undefined} onClick={() => setActiveTab('Tentang')}>Tentang</button>
    </nav>
    {activeTab === 'Postingan' ? <section className="member-profile-posts" aria-label="Postingan publik">
      <h2>Postingan</h2>
      {status === 'loading' && <p className="member-profile-state" role="status">Memuat profil dan postingan…</p>}
      {status === 'error' && <p className="member-profile-state" role="alert">Profil belum dapat dimuat. Periksa koneksi lalu coba lagi.</p>}
      {status === 'ready' && posts.length === 0 && <p className="member-profile-state">Belum ada postingan publik.</p>}
      {status === 'ready' && posts.map(post => <article className="member-profile-post" key={post.id}>
        <div className="member-profile-post-meta"><span>{post.topic || 'Ngopi Bareng'}</span><time>{postDate(post.createdAt)}</time></div>
        <p>{post.body}</p>
        <small><MessageCircle size={13}/> {Number(post.commentCount || 0)} komentar</small>
      </article>)}
    </section> : <section className="member-profile-about">
      <h2>Tentang {isOwnProfile ? 'Anda' : name}</h2>
      <p>{profile?.bio || 'Belum ada perkenalan publik.'}</p>
      {profile?.location && <p className="member-profile-about-location"><CalendarDays size={15}/> {profile.location}</p>}
      <p className="member-profile-privacy">Email dan informasi akun privat tidak ditampilkan di profil publik.</p>
    </section>}
    <p className="member-profile-privacy">Konten yang ditampilkan hanya postingan publik. Email dan data pribadi tidak dibuka.</p>
  </main>;
}
