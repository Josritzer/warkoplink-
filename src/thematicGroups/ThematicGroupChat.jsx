import { useEffect, useRef, useState } from 'react';
import {
  addDoc, collection, deleteDoc, doc, getDoc, limit, onSnapshot,
  orderBy, query, serverTimestamp, setDoc, updateDoc
} from 'firebase/firestore';
import { ArrowLeft, LogOut, Send, Users } from 'lucide-react';
import { getThematicGroupById } from './thematicGroupCatalog.js';
import { extractMentionUsernames } from '../notifications/notificationModel.js';
import { renderMemberMentions } from '../notifications/mentionText.jsx';

const GROUP_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

function initials(value) {
  return String(value || 'A').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function messageTime(value) {
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : null;
  return date ? new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(date) : '';
}

function messageDate(value) {
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : null;
  return date ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(date) : '';
}

export default function ThematicGroupChat({ db, user, groupId, targetMessageId = '', onBack, onNotice, onRequestAuth, onOpenMention }) {
  const group = getThematicGroupById(groupId);
  const [isMember, setIsMember] = useState(false);
  const [membershipLoading, setMembershipLoading] = useState(true);
  const [membershipBusy, setMembershipBusy] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [messages, setMessages] = useState([]);
  const [targetMessage, setTargetMessage] = useState(null);
  const [reactions, setReactions] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState('');
  const [draft, setDraft] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [sending, setSending] = useState(false);
  const membershipLock = useRef(false);

  useEffect(() => {
    let active = true;
    setIsMember(false);
    setMembershipLoading(Boolean(db && group && user?.uid));
    if (!db || !group || !user?.uid) {
      setMembershipLoading(false);
      return undefined;
    }

    const membershipRef = doc(db, 'thematicGroups', group.id, 'members', user.uid);
    const unsubscribe = onSnapshot(membershipRef, (snapshot) => {
      if (!active) return;
      setIsMember(snapshot.exists());
      setMembershipLoading(false);
    }, () => {
      if (!active) return;
      setIsMember(false);
      setMembershipLoading(false);
      setMessagesError('Status keanggotaan belum dapat dimuat. Periksa koneksi lalu coba lagi.');
    });
    return () => { active = false; unsubscribe(); };
  }, [db, group?.id, user?.uid]);

  useEffect(() => {
    let active = true;
    setProfileName('');
    if (!db || !user?.uid) return undefined;
    getDoc(doc(db, 'profiles', user.uid))
      .then((snapshot) => {
        if (!active) return;
        setProfileName(snapshot.exists() ? String(snapshot.data()?.displayName || '') : '');
      })
      .catch(() => { if (active) setProfileName(''); });
    return () => { active = false; };
  }, [db, user?.uid]);

  useEffect(() => {
    let active = true;
    setReactions([]);
    if (!db || !group || !user?.uid || !isMember) return undefined;
    const unsubscribe = onSnapshot(
      collection(db, 'thematicGroups', group.id, 'reactions'),
      (snapshot) => {
        if (!active) return;
        setReactions(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      },
      () => { if (active) setMessagesError('Reaksi belum dapat dimuat.'); }
    );
    return () => { active = false; unsubscribe(); };
  }, [db, group?.id, user?.uid, isMember]);

  useEffect(() => {
    let active = true;
    setMessages([]);
    setMessagesError('');
    if (!db || !group || !user?.uid || !isMember) {
      setMessagesLoading(false);
      return undefined;
    }

    setMessagesLoading(true);
    const membershipRef = doc(db, 'thematicGroups', group.id, 'members', user.uid);
    const messagesQuery = query(
      collection(db, 'thematicGroups', group.id, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      if (!active) return;
      const nextMessages = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).reverse();
      setMessages(nextMessages);
      setMessagesLoading(false);
      updateDoc(membershipRef, { lastReadAt: serverTimestamp() }).catch(() => {});
    }, () => {
      if (!active) return;
      setMessagesLoading(false);
      setMessagesError('Pesan grup belum dapat dimuat. Periksa koneksi lalu coba lagi.');
    });
    return () => { active = false; unsubscribe(); };
  }, [db, group?.id, user?.uid, isMember]);

  useEffect(() => {
    let active = true;
    setTargetMessage(null);
    if (!db || !group || !user?.uid || !isMember || !targetMessageId) return undefined;
    getDoc(doc(db, 'thematicGroups', group.id, 'messages', targetMessageId))
      .then((snapshot) => {
        if (!active || !snapshot.exists()) return;
        setTargetMessage({ id: snapshot.id, ...snapshot.data() });
      })
      .catch(() => {
        if (active) onNotice?.('Pesan dari notifikasi belum dapat dimuat. Anda tetap dapat membaca percakapan grup.');
      });
    return () => { active = false; };
  }, [db, group?.id, user?.uid, isMember, targetMessageId]);

  useEffect(() => {
    if (!isMember || !targetMessageId) return;
    document.getElementById(`thematic-message-${targetMessageId}`)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [isMember, targetMessageId, targetMessage, messages]);

  async function toggleMembership() {
    if (!group || !db || membershipBusy || membershipLock.current) return;
    if (!user?.uid) {
      onRequestAuth?.();
      onNotice?.('Masuk terlebih dahulu untuk bergabung dengan grup.');
      return;
    }

    membershipLock.current = true;
    setMembershipBusy(true);
    const membershipRef = doc(db, 'thematicGroups', group.id, 'members', user.uid);
    try {
      if (isMember) {
        await deleteDoc(membershipRef);
        setMessages([]);
        setReactions([]);
        setReplyingTo(null);
        onNotice?.('Anda sudah keluar dari grup.');
      } else {
        await setDoc(membershipRef, {
          uid: user.uid,
          joinedAt: serverTimestamp(),
          lastReadAt: serverTimestamp()
        });
        onNotice?.('Berhasil bergabung. Selamat berdiskusi!');
      }
    } catch {
      onNotice?.('Keanggotaan grup belum berhasil diperbarui. Periksa koneksi lalu coba lagi.');
    } finally {
      membershipLock.current = false;
      setMembershipBusy(false);
    }
  }

  async function toggleReaction(messageId, emoji) {
    if (!db || !user?.uid || !isMember) return;
    const reactionRef = doc(db, 'thematicGroups', group.id, 'reactions', `${messageId}_${user.uid}`);
    const current = reactions.find((item) => item.messageId === messageId && item.uid === user.uid);
    try {
      if (current?.emoji === emoji) await deleteDoc(reactionRef);
      else await setDoc(reactionRef, {
        messageId,
        uid: user.uid,
        emoji,
        updatedAt: serverTimestamp()
      });
    } catch {
      onNotice?.('Reaksi belum berhasil disimpan. Coba lagi.');
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !db || !user?.uid || !isMember || sending) return;
    if (!profileName) {
      onNotice?.('Profil belum siap. Muat ulang halaman atau masuk kembali sebelum mengirim pesan.');
      return;
    }

    setSending(true);
    try {
      const mentionedUsernames = extractMentionUsernames(text);
      const messageData = {
        senderUid: user.uid,
        senderName: profileName,
        text,
        createdAt: serverTimestamp(),
        ...(mentionedUsernames.length ? { mentionedUsernames } : {})
      };
      if (replyingTo?.id) messageData.replyToMessageId = replyingTo.id;
      const savedMessage = await addDoc(collection(db, 'thematicGroups', group.id, 'messages'), messageData);
      setDraft('');
      setReplyingTo(null);
      if (mentionedUsernames.length) {
        const notifications = await Promise.allSettled(mentionedUsernames.map(async (username) => {
          const usernameSnapshot = await getDoc(doc(db, 'usernames', username));
          if (!usernameSnapshot.exists()) return;
          const recipientUid = usernameSnapshot.data()?.uid;
          if (!recipientUid || recipientUid === user.uid) return;
          await setDoc(doc(db, 'notifications', `group_mention_${savedMessage.id}_${recipientUid}`), {
            recipientUid,
            actorUid: user.uid,
            type: 'mention',
            groupId: group.id,
            messageId: savedMessage.id,
            username,
            createdAt: serverTimestamp(),
            readAt: null
          });
        }));
        if (notifications.some((result) => result.status === 'rejected' && result.reason?.code !== 'permission-denied')) {
          onNotice?.('Pesan terkirim, tetapi sebagian notifikasi mention belum dapat dikirim.');
        }
      }
    } catch {
      onNotice?.('Pesan belum berhasil dikirim. Periksa koneksi lalu coba lagi.');
    } finally {
      setSending(false);
    }
  }

  const visibleMessages = targetMessage && !messages.some((item) => item.id === targetMessage.id)
    ? [...messages, targetMessage].sort((a, b) => (a.createdAt?.toMillis?.() || a.createdAt?.toDate?.().getTime?.() || 0) - (b.createdAt?.toMillis?.() || b.createdAt?.toDate?.().getTime?.() || 0))
    : messages;

  if (!group) return <section className="content-section"><p>Grup Tematik tidak ditemukan.</p><button type="button" className="button button-quiet" onClick={onBack}>Kembali ke Obrolan</button></section>;

  return <section className="thematic-chat-page" aria-label={`Percakapan grup ${group.name}`}>
    <header className="thematic-chat-header">
      <button type="button" className="thematic-back-button" onClick={onBack} aria-label="Kembali ke Obrolan"><ArrowLeft size={18}/></button>
      <span className="thematic-group-icon thematic-chat-avatar"><Users size={22}/></span>
      <div className="thematic-chat-title">
        <h1>{group.name}</h1>
        <small>Grup Tematik · Percakapan bersama</small>
      </div>
      {user?.uid && !membershipLoading && <button type="button" className="thematic-leave-button" onClick={toggleMembership} disabled={membershipBusy || !isMember} aria-label="Keluar grup" title="Keluar grup"><LogOut size={17}/></button>}
    </header>

    <div className="thematic-chat-about">
      <b>Tentang grup</b>
      <p>{group.description}</p>
      <small>Semua anggota memiliki hak yang sama. Anda bebas bergabung dan keluar kapan saja.</small>
    </div>

    {membershipLoading && <p className="thematic-chat-status" role="status">Memeriksa keanggotaan…</p>}
    {!membershipLoading && !isMember && <div className="thematic-join-panel">
      <Users size={26}/>
      <h2>Gabung untuk ikut percakapan</h2>
      <p>Riwayat grup tetap tersimpan. Jika bergabung kembali, Anda dapat membaca pesan sebelumnya.</p>
      <button type="button" className="thematic-join-button" onClick={toggleMembership} disabled={membershipBusy || !db}>
        {membershipBusy ? 'Memproses…' : 'Gabung grup'}
      </button>
    </div>}

    {isMember && <>
      <div className="thematic-message-list" aria-label="Pesan grup" aria-live="polite" aria-busy={messagesLoading}>
        {messagesLoading && <p className="thematic-chat-status" role="status">Memuat percakapan…</p>}
        {!messagesLoading && !messages.length && <div className="thematic-chat-empty">
          <Users size={26}/>
          <b>Mulai percakapan pertama</b>
          <p>Sapa anggota lain dan mulai berbagi pengalaman.</p>
        </div>}
        {visibleMessages.map((message, index) => {
          const own = message.senderUid === user?.uid;
          const previous = messages[index - 1];
          const date = messageDate(message.createdAt);
          const showDate = date && date !== messageDate(previous?.createdAt);
          return <div key={message.id} className="thematic-message-group">
            {showDate && <div className="thematic-date-divider"><span>{date}</span></div>}
            <article id={`thematic-message-${message.id}`} data-message-id={message.id} className={`thematic-message ${own ? 'own' : ''} ${message.id === targetMessageId ? 'is-targeted' : ''}`.trim()}>
              {!own && <span className="thematic-message-initial">{initials(message.senderName)}</span>}
              <div className="thematic-message-bubble">
                {!own && <b>{message.senderName || 'Anggota WARKOPLINK'}</b>}
                {message.replyToMessageId && (() => {
                  const original = messages.find((item) => item.id === message.replyToMessageId);
                  return <div className="thematic-reply-quote">
                    <small>Membalas {original?.senderName || 'pesan sebelumnya'}</small>
                    <span>{original?.text || 'Pesan yang dibalas tidak tersedia'}</span>
                  </div>;
                })()}
                <p>{renderMemberMentions(message.text, onOpenMention)}</p>
                <div className="thematic-message-actions">
                  <time>{messageTime(message.createdAt)}</time>
                  <button type="button" aria-label={`Balas pesan ${message.senderName || 'anggota'}`} onClick={() => setReplyingTo(message)}>Balas</button>
                </div>
                <div className="thematic-reaction-row" aria-label="Reaksi pesan">
                  {GROUP_REACTION_EMOJIS.map((emoji) => {
                    const matching = reactions.filter((item) => item.messageId === message.id && item.emoji === emoji);
                    const mine = matching.some((item) => item.uid === user?.uid);
                    return <button key={emoji} type="button" className={mine ? 'is-selected' : ''} aria-pressed={mine} aria-label={`Reaksi ${emoji} (${matching.length})`} onClick={() => toggleReaction(message.id, emoji)}>
                      <span>{emoji}</span>{matching.length > 0 && <small>{matching.length}</small>}
                    </button>;
                  })}
                </div>
              </div>
            </article>
          </div>;
        })}
        {messagesError && <p className="thematic-chat-error" role="alert">{messagesError}</p>}
      </div>
      <form className="thematic-compose-wrap" onSubmit={sendMessage}>
        {replyingTo && <div className="thematic-replying-banner">
          <span><b>Membalas {replyingTo.senderName || 'anggota'}</b><small>{String(replyingTo.text || '').slice(0, 110)}</small></span>
          <button type="button" aria-label="Batalkan balasan" onClick={() => setReplyingTo(null)}>×</button>
        </div>}
        <div className="thematic-compose">
          <label className="sr-only" htmlFor="thematic-message-input">Tulis pesan grup</label>
          <input id="thematic-message-input" aria-label="Tulis pesan grup" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder="Tulis pesan…" disabled={sending}/>
          <span className="thematic-compose-count">{draft.length}/2000</span>
          <button type="submit" aria-label="Kirim pesan" disabled={!draft.trim() || sending || !profileName}>{sending ? '…' : <Send size={18}/>}</button>
        </div>
      </form>
    </>}
  </section>;
}
