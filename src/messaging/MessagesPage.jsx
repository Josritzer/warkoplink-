import { useEffect, useState } from 'react';
import {
  collection, doc, getDoc, limit, onSnapshot, orderBy, query,
  serverTimestamp, updateDoc, where, writeBatch
} from 'firebase/firestore';
import { MessageCircle, Users, UserRound, Send, ArrowLeft, LoaderCircle } from 'lucide-react';
import { conversationIdFor, messagePreview } from './messageModel.js';

const tabs = [
  { id: 'pribadi', label: 'Pribadi' },
  { id: 'teman', label: 'Teman' }
];
const timeLabel = value => {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).format(date);
};
function Avatar({ profile }) {
  return <span className="message-avatar">{profile?.photoURL ? <img src={profile.photoURL} alt="" /> : <UserRound size={19}/>}</span>;
}

export default function MessagesPage({
  db, user, onOpenMemberProfile, initialTab = 'pribadi',
  initialConversationId = '', initialFriend = null
}) {
  const [tab, setTab] = useState(initialTab === 'teman' ? 'teman' : 'pribadi');
  const [friends, setFriends] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [selectedId, setSelectedId] = useState(initialConversationId);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setTab(initialTab === 'teman' ? 'teman' : 'pribadi'), [initialTab]);
  useEffect(() => { if (initialConversationId) setSelectedId(initialConversationId); }, [initialConversationId]);

  useEffect(() => {
    if (!db || !user?.uid || !initialFriend?.uid) return undefined;
    let active = true;
    const id = conversationIdFor(user.uid, initialFriend.uid);
    setTab('pribadi');
    setSelectedFriend(initialFriend);
    setSelectedId('');
    getDoc(doc(db, 'conversations', id)).then(snapshot => {
      if (active && snapshot.exists()) setSelectedId(id);
    }).catch(() => {
      if (active) setError('Percakapan belum dapat diperiksa. Coba lagi.');
    });
    return () => { active = false; };
  }, [db, user?.uid, initialFriend?.uid]);

  useEffect(() => {
    if (!db || !user?.uid) { setFriends([]); setLoadingFriends(false); return undefined; }
    let inbound = [], outbound = [], active = true;
    setLoadingFriends(true);
    const refresh = async () => {
      const ids = [...new Set([...inbound.map(x => x.followerUid), ...outbound.map(x => x.followedUid)].filter(x => x && x !== user.uid))];
      const rows = await Promise.all(ids.map(async uid => {
        try {
          const [a, b, p] = await Promise.all([
            getDoc(doc(db, 'userFollows', `${user.uid}_${uid}`)),
            getDoc(doc(db, 'userFollows', `${uid}_${user.uid}`)),
            getDoc(doc(db, 'publicProfiles', uid))
          ]);
          return a.exists() && b.exists() ? { uid, ...(p.exists() ? p.data() : {}), displayName: p.data()?.displayName || 'Anggota WarkopLink' } : null;
        } catch { return null; }
      }));
      if (active) { setFriends(rows.filter(Boolean).sort((a,b) => a.displayName.localeCompare(b.displayName,'id'))); setLoadingFriends(false); }
    };
    const a = onSnapshot(query(collection(db,'userFollows'),where('followedUid','==',user.uid)),s=>{inbound=s.docs.map(d=>d.data());refresh();},()=>{setLoadingFriends(false);setError('Daftar teman belum dapat dimuat.');});
    const b = onSnapshot(query(collection(db,'userFollows'),where('followerUid','==',user.uid)),s=>{outbound=s.docs.map(d=>d.data());refresh();},()=>{setLoadingFriends(false);setError('Daftar teman belum dapat dimuat.');});
    return ()=>{active=false;a();b();};
  },[db,user?.uid]);

  useEffect(() => {
    if (!db || !user?.uid) { setConversations([]); setLoadingConversations(false); return undefined; }
    setLoadingConversations(true);
    return onSnapshot(query(collection(db,'conversations'),where('participantUids','array-contains',user.uid),limit(50)),async snap=>{
      const rows=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.lastMessageAt?.toMillis?.()||0)-(a.lastMessageAt?.toMillis?.()||0));
      setConversations(rows);
      const ids=[...new Set(rows.map(x=>x.participantUids?.find(id=>id!==user.uid)).filter(Boolean))];
      const people=await Promise.all(ids.map(async uid=>{try{const p=await getDoc(doc(db,'publicProfiles',uid));return [uid,p.exists()?p.data():null];}catch{return [uid,null];}}));
      setProfiles(current=>({...current,...Object.fromEntries(people)}));setLoadingConversations(false);
    },()=>{setLoadingConversations(false);setError('Percakapan belum dapat dimuat. Periksa koneksi lalu coba lagi.');});
  },[db,user?.uid]);

  const conversation = conversations.find(x => x.id === selectedId) || null;
  const otherUid = conversation?.participantUids?.find(x=>x!==user?.uid) || selectedId.split('__').find(x=>x!==user?.uid);
  const recipient = selectedFriend || (otherUid ? {uid:otherUid,...(profiles[otherUid]||{})} : null);

  useEffect(() => {
    if (!db || !selectedId || !conversation || !user?.uid) { setMessages([]); setLoadingMessages(false); return undefined; }
    setLoadingMessages(true);
    return onSnapshot(query(collection(db,'conversations',selectedId,'messages'),orderBy('createdAt','desc'),limit(100)),snap=>{
      setMessages(snap.docs.map(d=>({id:d.id,...d.data()})).reverse());setLoadingMessages(false);
      if(conversation.unreadFor===user.uid) updateDoc(doc(db,'conversations',selectedId),{unreadFor:''}).catch(()=>{});
    },()=>{setLoadingMessages(false);setError('Pesan belum dapat dimuat. Coba lagi.');});
  },[db,selectedId,conversation?.unreadFor,user?.uid]);

  async function startChat(friend) {
    if(!friend?.uid||!db||!user?.uid)return;
    setError('');
    try {
      const id=conversationIdFor(user.uid,friend.uid);
      const snapshot=await getDoc(doc(db,'conversations',id));
      setSelectedFriend(friend);setSelectedId(snapshot.exists()?id:'');setTab('pribadi');
    } catch { setError('Percakapan belum dapat dibuka. Coba lagi.'); }
  }

  async function send(event) {
    event.preventDefault();const body=draft.trim();
    if(!body||body.length>2000||sending||!recipient?.uid||!db||!user?.uid)return;
    setSending(true);setError('');
    try {
      const [forward,reverse]=await Promise.all([
        getDoc(doc(db,'userFollows',`${user.uid}_${recipient.uid}`)),
        getDoc(doc(db,'userFollows',`${recipient.uid}_${user.uid}`))
      ]);
      if(!forward.exists()||!reverse.exists())throw new Error('friend-required');
      const id=conversationIdFor(user.uid,recipient.uid), conversationRef=doc(db,'conversations',id), existing=await getDoc(conversationRef);
      const messageRef=doc(collection(conversationRef,'messages')), batch=writeBatch(db), participants=[user.uid,recipient.uid].sort();
      const latest={updatedAt:serverTimestamp(),lastMessagePreview:messagePreview(body),lastMessageAt:serverTimestamp(),lastSenderUid:user.uid,lastMessageId:messageRef.id,unreadFor:recipient.uid};
      if(!existing.exists())batch.set(conversationRef,{...latest,participantUids:participants,createdAt:serverTimestamp()});
      else batch.update(conversationRef,latest);
      batch.set(messageRef,{senderUid:user.uid,recipientUid:recipient.uid,body,createdAt:serverTimestamp(),deliveryStatus:'sent'});
      batch.set(doc(db,'notifications',`message_${messageRef.id}`),{recipientUid:recipient.uid,actorUid:user.uid,type:'message',conversationId:id,messageId:messageRef.id,createdAt:serverTimestamp(),readAt:null});
      await batch.commit();setDraft('');setSelectedId(id);setSelectedFriend(null);
    } catch(e) { setError(e?.message==='friend-required'?'Pesan hanya dapat dikirim kepada teman yang saling mengikuti.':'Pesan gagal dikirim. Periksa koneksi lalu coba lagi.'); }
    finally{setSending(false);}
  }

  if((selectedId||selectedFriend)&&tab==='pribadi') return <section className="content-section messages-page" aria-label="Percakapan pribadi">
    <div className="message-thread-heading"><button className="message-back" onClick={()=>{setSelectedId('');setSelectedFriend(null);}} aria-label="Kembali"><ArrowLeft size={18}/></button><button className="message-person" onClick={()=>recipient?.uid&&onOpenMemberProfile?.(recipient)}><Avatar profile={recipient}/><span><b>{recipient?.displayName||'Anggota WarkopLink'}</b><small>Percakapan pribadi · status aktif tidak tersedia</small></span></button></div>
    <div className="message-thread-list" aria-live="polite">{loadingMessages?<p role="status">Memuat pesan…</p>:messages.length?messages.map(m=><div key={m.id} className={m.senderUid===user.uid?'message-bubble own':'message-bubble'}><p>{m.body}</p><small>{timeLabel(m.createdAt)} · {m.senderUid===user.uid?(m.deliveryStatus==='sent'?'Terkirim':'Mengirim…'):'Pesan masuk'}</small></div>):<div className="message-empty-inline"><MessageCircle size={22}/><p>Mulai percakapan dengan teman Anda.</p></div>}</div>
    {error&&<p className="message-error" role="alert">{error}</p>}
    <form className="message-compose" onSubmit={send}><input aria-label="Tulis pesan pribadi" value={draft} onChange={e=>setDraft(e.target.value)} maxLength={2000} placeholder="Tulis pesan…"/><button type="submit" disabled={!draft.trim()||sending} aria-label="Kirim pesan">{sending?<LoaderCircle size={18} className="spin"/>:<Send size={18}/>}</button></form>
  </section>;

  return <section className="content-section messages-page" aria-label="Halaman Pesan">
    <span className="eyebrow">PESAN & KONEKSI</span><h2>Pesan</h2><p className="messages-intro">Percakapan pribadi dan daftar teman yang saling mengikuti.</p>
    <div className="messages-tabs" role="tablist" aria-label="Kategori pesan">{tabs.map(t=><button key={t.id} type="button" role="tab" aria-selected={tab===t.id} aria-controls="message-panel" className="messages-tab" onClick={()=>{setTab(t.id);setSelectedId('');setSelectedFriend(null);}}>{t.label}</button>)}</div>
    <div id="message-panel" className="messages-panel" role="tabpanel">
      {error&&<p className="message-error" role="alert">{error}</p>}
      {tab==='pribadi'&&<><div className="message-list-heading"><h3>Percakapan pribadi</h3><span>{user?.uid ? conversations.length : '—'}</span></div>
        {!user?.uid?<div className="message-empty"><MessageCircle size={24}/><h3>Masuk untuk membuka pesan pribadi</h3><p>Fitur pertemanan dan pesan pribadi tersedia setelah Anda masuk.</p></div>:loadingConversations?<p role="status">Memuat percakapan…</p>:conversations.length?<div className="message-conversation-list">{conversations.map(row=>{const uid=row.participantUids?.find(x=>x!==user.uid),profile=profiles[uid]||{uid,displayName:'Anggota WarkopLink'};return <button key={row.id} className="message-conversation-item" onClick={()=>{setSelectedFriend(profile);setSelectedId(row.id);}}><Avatar profile={profile}/><span className="message-conversation-copy"><b>{profile.displayName}</b><small>{row.lastMessagePreview||'Mulai percakapan'}</small></span><span className="message-conversation-meta"><time>{timeLabel(row.lastMessageAt)}</time>{row.unreadFor===user.uid&&<i aria-label="Pesan belum dibaca"/>}</span></button>;})}</div>:<div className="message-empty"><MessageCircle size={24}/><h3>Belum ada pesan pribadi</h3><p>Mulai percakapan dari daftar Teman yang saling mengikuti.</p><button className="button button-dark" onClick={()=>setTab('teman')}>Lihat Teman</button></div>}</>}
      
      {tab==='teman'&&<><div className="message-list-heading"><h3>Teman</h3><span>{user?.uid ? friends.length : '—'}</span></div><p className="message-presence-note">Status aktif belum tersedia. WARKOPLINK tidak menebak kehadiran dari waktu pesan terakhir.</p>{!user?.uid?<div className="message-empty"><Users size={24}/><h3>Masuk untuk melihat teman</h3><p>Hubungan saling mengikuti akan ditampilkan sebagai teman setelah Anda masuk.</p></div>:loadingFriends?<p role="status">Memuat teman…</p>:friends.length?<div className="message-friend-list">{friends.map(friend=><div className="message-friend-item" key={friend.uid}><button className="message-friend-profile" onClick={()=>onOpenMemberProfile?.(friend)}><Avatar profile={friend}/><span><b>{friend.displayName}</b><small>{friend.username?'@'+friend.username:'Saling mengikuti'}</small></span></button><button className="message-friend-action" onClick={()=>startChat(friend)} aria-label={'Kirim pesan kepada '+friend.displayName}><MessageCircle size={17}/><span>Pesan</span></button></div>)}</div>:<div className="message-empty"><Users size={24}/><h3>Teman muncul di sini saat kalian saling mengikuti</h3><p>Hanya follow dua arah yang dihitung sebagai teman. Status aktif tidak tersedia karena sistem presence belum tersedia.</p></div>}</>}
    </div>
  </section>;
}
