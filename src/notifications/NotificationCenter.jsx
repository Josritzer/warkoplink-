import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, where, updateDoc, writeBatch } from 'firebase/firestore';
import { Bell, CheckCheck, MessageCircle, AtSign, Heart, Store, UserRound, MessageSquare } from 'lucide-react';
import { filterNotifications, isUnreadNotification, notificationLabel } from './notificationModel.js';
import { relativePostTime } from '../chat/postTime.js';

const ICONS = { mention: AtSign, comment: MessageCircle, reaction: Heart, follow: Store, friend: UserRound, message: MessageSquare };

export default function NotificationCenter({ db, user, onOpenNotification, onNotice }) {
  const [items, setItems] = useState([]);
  const [authors, setAuthors] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!db || !user?.uid) { setItems([]); setLoading(false); setLoadError(false); return undefined; }
    setLoading(true);
    setLoadError(false);
    return onSnapshot(query(collection(db, 'notifications'), where('recipientUid', '==', user.uid), orderBy('createdAt', 'desc'), limit(100)), snapshot => {
      const own = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setItems(own);
      setLoadError(false);
      setLoading(false);
    }, () => {
      setLoadError(true);
      setLoading(false);
      onNotice?.('Notifikasi belum dapat dimuat. Periksa koneksi lalu coba lagi.');
    });
  }, [db, user?.uid]);

  const actorIds = useMemo(() => [...new Set(items.map(item => item.actorUid).filter(uid => uid && uid !== user?.uid))], [items, user?.uid]);
  useEffect(() => {
    let active = true;
    if (!db || !actorIds.length) { setAuthors({}); return undefined; }
    Promise.all(actorIds.map(async uid => {
      try {
        const snapshot = await getDoc(doc(db, 'publicProfiles', uid));
        return [uid, snapshot.exists() ? snapshot.data() : null];
      } catch { return [uid, null]; }
    })).then(rows => { if (active) setAuthors(Object.fromEntries(rows)); });
    return () => { active = false; };
  }, [db, actorIds.join('|')]);

  const unreadCount = items.filter(isUnreadNotification).length;
  const visibleItems = filterNotifications(items, filter);

  async function markAllRead() {
    if (!db || !items.length || !unreadCount || busy) return;
    setBusy(true);
    try {
      const recipientItems = await getDocs(query(
        collection(db, 'notifications'),
        where('recipientUid', '==', user.uid)
      ));
      const unread = recipientItems.docs.filter(item => isUnreadNotification(item.data()));
      for (let offset = 0; offset < unread.length; offset += 450) {
        const batch = writeBatch(db);
        unread.slice(offset, offset + 450).forEach(item => {
          batch.update(doc(db, 'notifications', item.id), { readAt: serverTimestamp() });
        });
        await batch.commit();
      }
    } catch {
      onNotice?.('Notifikasi belum berhasil ditandai dibaca. Coba lagi.');
    } finally { setBusy(false); }
  }

  async function openItem(item) {
    if (isUnreadNotification(item)) {
      try { await updateDoc(doc(db, 'notifications', item.id), { readAt: serverTimestamp() }); }
      catch { onNotice?.('Status notifikasi belum dapat diperbarui.'); }
    }
    onOpenNotification?.(item);
  }

  if (!user) return <section className="content-section notification-section"><span className="eyebrow">NOTIFIKASI</span><h2>Aktivitas Anda</h2><p>Masuk untuk melihat mention, komentar, dan aktivitas komunitas yang ditujukan kepada Anda.</p></section>;

  return <section className="content-section notification-section">
    <div className="notification-heading">
      <div><span className="eyebrow">NOTIFIKASI</span><h2>Aktivitas Anda</h2><p>{unreadCount ? `${unreadCount} belum dibaca` : 'Semua sudah diperiksa'}</p></div>
      <button className="button button-quiet" type="button" onClick={markAllRead} disabled={!unreadCount || busy}><CheckCheck size={16}/>{busy ? 'Memproses…' : 'Baca semua'}</button>
    </div>
    {!loading && items.length > 0 && <div className="notification-filters" role="group" aria-label="Filter notifikasi">
      <button type="button" className={filter === 'all' ? 'is-active' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Semua <span>{items.length}</span></button>
      <button type="button" className={filter === 'unread' ? 'is-active' : ''} aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')}>Belum dibaca <span>{unreadCount}</span></button>
    </div>}
    {loading ? <div className="empty-state" role="status"><p>Memuat notifikasi…</p></div> :
      loadError ? <div className="empty-state notification-empty" role="alert"><span><Bell size={22}/></span><h3>Notifikasi belum tersedia</h3><p>Periksa koneksi internet. Daftar akan dimuat kembali saat koneksi pulih.</p></div> :
      visibleItems.length ? <div className="notification-list">{visibleItems.map(item => {
        const Icon = ICONS[item.type] || Bell;
        const actor = authors[item.actorUid];
        const actorName = actor?.displayName || 'Anggota WarkopLink';
        return <button type="button" className={isUnreadNotification(item) ? 'notification-item unread' : 'notification-item'} key={item.id} onClick={() => openItem(item)}>
          <span className="notification-icon">{actor?.photoURL ? <img src={actor.photoURL} alt="" loading="lazy"/> : <Icon size={18}/>}</span>
          <span className="notification-copy"><b>{actorName}</b><span>{notificationLabel(item)}{item.username ? ` · @${item.username}` : ''}</span><small>{item.createdAt?.toDate ? relativePostTime(item.createdAt) : 'Baru saja'}</small></span>
          {isUnreadNotification(item) && <i aria-label="Belum dibaca"/>}
        </button>;
      })}</div> :
      items.length ? <div className="empty-state notification-empty"><span><CheckCheck size={22}/></span><h3>Tidak ada notifikasi baru</h3><p>Semua aktivitas sudah Anda baca.</p><button className="button button-quiet" type="button" onClick={() => setFilter('all')}>Lihat semua notifikasi</button></div> :
      <div className="empty-state notification-empty"><span><Bell size={22}/></span><h3>Belum ada notifikasi</h3><p>Pesan pribadi, komentar, mention, dan pertemanan baru akan muncul di sini.</p></div>}
  </section>;
}
