import { useEffect, useState } from 'react';
import { ArrowLeft, MessageCircle, UserRound, Pencil, CalendarDays } from 'lucide-react';
import { collection, deleteDoc, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { friendNotificationId } from '../messaging/messageModel.js';
import { isPublicPost } from '../lib.js';

function postDate(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export default function PublicUserProfile({ profile: fallbackProfile, db, currentUser, onBack, onEditProfile, onStartMessage }) {
  const uid = fallbackProfile?.uid || '';
  const [profile, setProfile] = useState(fallbackProfile || null);
  const [posts, setPosts] = useState([]);
  const [status, setStatus] = useState('loading');
  const [activeTab, setActiveTab] = useState('Postingan');
  const [isFollowing, setIsFollowing] = useState(false);
  const [isMutual, setIsMutual] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followError, setFollowError] = useState('');
  const isOwnProfile = Boolean(currentUser?.uid && currentUser.uid === uid);

  useEffect(() => {
    if (!db || !currentUser?.uid || !uid || currentUser.uid === uid) {
      setIsFollowing(false); setIsMutual(false); return undefined;
    }
    let active = true;
    Promise.all([
      getDoc(doc(db, 'userFollows', `${currentUser.uid}_${uid}`)),
      getDoc(doc(db, 'userFollows', `${uid}_${currentUser.uid}`))
    ]).then(([outgoing, incoming]) => {
      if (active) { setIsFollowing(outgoing.exists()); setIsMutual(outgoing.exists() && incoming.exists()); }
    }).catch(() => { if (active) { setIsFollowing(false); setIsMutual(false); } });
    return () => { active = false; };
  }, [db, currentUser?.uid, uid]);

  async function toggleFollow() {
    if (!db || !currentUser?.uid || !uid || isOwnProfile || followBusy) return;
    setFollowBusy(true);
    setFollowError('');
    const previousFollowing = isFollowing;
    const previousMutual = isMutual;
    const followRef = doc(db, 'userFollows', `${currentUser.uid}_${uid}`);
    try {
      if (isFollowing) {
        await deleteDoc(followRef);
        setIsFollowing(false); setIsMutual(false);
      } else {
        await setDoc(followRef, { followerUid: currentUser.uid, followedUid: uid, createdAt: serverTimestamp() });
        setIsFollowing(true);
        const reverse = await getDoc(doc(db, 'userFollows', `${uid}_${currentUser.uid}`));
        setIsMutual(reverse.exists());
        if (reverse.exists()) {
          const notificationRef = doc(db, 'notifications', friendNotificationId(currentUser.uid, uid, uid));
          const notification = await getDoc(notificationRef);
          if (!notification.exists()) {
            await setDoc(notificationRef, { recipientUid: uid, actorUid: currentUser.uid, type: 'friend', friendUid: currentUser.uid, createdAt: serverTimestamp(), readAt: null });
          }
        }
      }
    } catch {
      setIsFollowing(previousFollowing); setIsMutual(previousMutual);
      setFollowError('Perubahan ikuti belum berhasil disimpan. Periksa koneksi lalu coba lagi.');
    } finally { setFollowBusy(false); }
  }

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
            username: typeof data.username === 'string' ? data.username : '',
            bio: typeof data.bio === 'string' ? data.bio : '',
            location: typeof data.location === 'string' ? data.location : '',
            interests: Array.isArray(data.interests) ? data.interests : [],
            socialLinks: data.socialLinks && typeof data.socialLinks === 'object' ? data.socialLinks : {}
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
          <p>{profile?.username ? '@' + profile.username : (isOwnProfile ? 'Ini profil Anda' : 'Anggota komunitas WarkopLink')}</p>
        </div>
        {isOwnProfile && <button type="button" className="button button-dark member-profile-edit-mobile" onClick={onEditProfile}><Pencil size={15}/> Edit profil</button>}
        {!isOwnProfile && currentUser?.uid && <div className="member-profile-social-actions">
          <button type="button" className={isFollowing ? 'button button-quiet' : 'button button-dark'} onClick={toggleFollow} disabled={followBusy}>{followBusy ? 'Memproses…' : isMutual ? 'Teman' : isFollowing ? 'Mengikuti' : 'Ikuti'}</button>
          {isMutual && <button type="button" className="button button-quiet" onClick={() => onStartMessage?.(profile || fallbackProfile)}><MessageCircle size={15}/> Pesan</button>}
          {followError && <small className="message-error" role="alert">{followError}</small>}
        </div>}
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
