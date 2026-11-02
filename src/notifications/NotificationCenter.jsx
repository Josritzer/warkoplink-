import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp, where, updateDoc, writeBatch } from 'firebase/firestore';
import { Bell, CheckCheck, MessageCircle, AtSign, Heart, Store, UserRound, MessageSquare } from 'lucide-react';
import { isUnreadNotification, notificationLabel } from './notificationModel.js';
import { relativePostTime } from '../chat/postTime.js';

const ICONS = { mention: AtSign, comment: MessageCircle, reaction: Heart, follow: Store, friend: UserRound, message: MessageSquare };

export default function NotificationCenter({ db, user, onOpenNotification, onNotice }) {
  const [items, setItems] = useState([]);
  const [authors, setAuthors] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!db || !user?.uid) { setItems([]); setLoading(false); return undefined; }
    setLoading(true);
    return onSnapshot(query(collection(db, 'notifications'), where('recipientUid', '==', user.uid), orderBy('createdAt', 'desc'), limit(50)), snapshot => {
      const own = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setItems(own);
      setLoading(false);
    }, () => {
      setItems([]);
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

  async function markAllRead() {
    if (!db || !items.length || !unreadCount || busy) return;
    setBusy(true);
    try {
      const batch = writeBatch(db);
      items.filter(isUnreadNotification).forEach(item => batch.update(doc(db, 'notifications', item.id), { readAt: serverTimestamp() }));
      await batch.commit();
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
    {loading ? <div className="empty-state" role="status"><p>Memuat notifikasi…</p></div> :
      items.length ? <div className="notification-list">{items.map(item => {
        const Icon = ICONS[item.type] || Bell;
        const actor = authors[item.actorUid];
        return <button type="button" className={isUnreadNotification(item) ? 'notification-item unread' : 'notification-item'} key={item.id} onClick={() => openItem(item)}>
          <span className="notification-icon"><Icon size={18}/></span>
          <span className="notification-copy"><b>{actor?.displayName || 'Anggota WarkopLink'}</b><span>{notificationLabel(item)}{item.username ? ` · @${item.username}` : ''}</span><small>{item.createdAt?.toDate ? relativePostTime(item.createdAt) : 'Baru saja'}</small></span>
          {isUnreadNotification(item) && <i aria-label="Belum dibaca"/>}
        </button>;
      })}</div> : <div className="empty-state notification-empty"><span><Bell size={22}/></span><h3>Belum ada notifikasi</h3><p>Pesan pribadi, komentar, mention, dan pertemanan baru akan muncul di sini.</p></div>}
  </section>;
}
