import { MessageSquare, MoreHorizontal, Send, Share2, Trash2, Store, Play, Pause, RotateCcw } from 'lucide-react';
import LikeSummary from './LikeSummary.jsx';
import { useEffect, useRef, useState } from 'react';
import { displayTopic, POST_SUBTYPES, POST_TOPICS } from '../lib.js';
import { createPortal } from 'react-dom';
import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase.js';
import { renderMemberMentions } from '../notifications/mentionText.jsx';
import { getCommunityById } from '../community/communityCatalog.js';

const EMOJIS = ["👍","👏","🙌","💪","🤝","💯","❤️","🥰","😍","😘","💖","💕","😂","🤣","😆","😹","😅","🤪","😮","😲","🤯","🤩","🥳","✨","😢","😭","🥺","😔","💔","🫂","😡","🤬","😤","🙄","😠","👎"];
const PRIMARY_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡'];
const EXTRA_EMOJIS = EMOJIS.filter(emoji => !PRIMARY_EMOJIS.includes(emoji));
const REACTION_FIELDS = {
  like: '👍', love: '❤️', haha: '😂', wow: '😮', sad: '😢', angry: '😡'
};
const EMPTY_REACTIONS = { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 };
const POST_CATEGORY_CLASS = { 'Ngopi Bareng': 'ngopi', 'Tanya Warkop': 'tanya', 'Info & Acara': 'info', 'Loker': 'loker', 'Jual Beli & Jasa Lokal': 'jual-beli' };

function avatarInitial(post) {
  return String(post?.authorName || 'A').trim().slice(0, 1).toUpperCase() || 'A';
}

function calendarDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function calendarLink(post) {
  const start = calendarDate(post.eventStartAt);
  if (!start) return '';
  const end = calendarDate(post.eventEndAt) || calendarDate(new Date(new Date(post.eventStartAt).getTime() + 2 * 60 * 60 * 1000).toISOString());
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: post.eventKind ? `${post.eventKind}: ${String(post.body || '').slice(0, 90)}` : String(post.body || 'Acara WarkopLink').slice(0, 100),
    dates: `${start}/${end}`,
    details: `${post.body || ''}\n\nAcara komunitas WarkopLink`,
    location: post.location || ''
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function downloadIcs(post) {
  const start = calendarDate(post.eventStartAt);
  if (!start) return false;
  const end = calendarDate(post.eventEndAt) || calendarDate(new Date(new Date(post.eventStartAt).getTime() + 2 * 60 * 60 * 1000).toISOString());
  const escapeIcs = value => String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const uid = `${post.id}@warkoplink`;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//WarkopLink//Agenda//ID', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${calendarDate(new Date().toISOString())}`,
    `DTSTART:${start}`, `DTEND:${end}`,
    `SUMMARY:${escapeIcs(post.eventKind ? `${post.eventKind}: ${String(post.body || '').slice(0, 90)}` : String(post.body || 'Acara WarkopLink').slice(0, 100))}`,
    `DESCRIPTION:${escapeIcs(post.body || '')}`, `LOCATION:${escapeIcs(post.location || '')}`,
    'END:VEVENT', 'END:VCALENDAR'
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `warkoplink-acara-${post.id}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}

function normalizedWhatsAppNumber(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  if (digits.length < 9 || digits.length > 15) return '';
  return digits;
}

function renderWarungMentions(body, warungs = [], onOpenWarung) {
  const text = String(body || '');
  const lower = text.toLocaleLowerCase('id-ID');
  const candidates = [];
  for (const warung of warungs) {
    if (!warung?.id || !warung?.name) continue;
    const token = `@${warung.name}`;
    const needle = token.toLocaleLowerCase('id-ID');
    let from = 0;
    while (from < lower.length) {
      const start = lower.indexOf(needle, from);
      if (start < 0) break;
      const end = start + token.length;
      const before = start === 0 ? '' : text[start - 1];
      const after = end >= text.length ? '' : text[end];
      if ((!before || !/[A-Za-z0-9_]/.test(before)) && (!after || !/[A-Za-z0-9_]/.test(after))) candidates.push({ start, end, warung });
      from = start + token.length;
    }
  }
  candidates.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const parts = [];
  let cursor = 0;
  for (const match of candidates) {
    if (match.start < cursor) continue;
    if (match.start > cursor) parts.push(text.slice(cursor, match.start));
    parts.push(<a key={`warung-${match.warung.id}-${match.start}`} className="warung-mention" href={`?warung=${encodeURIComponent(match.warung.id)}`} onClick={event => { if (onOpenWarung) { event.preventDefault(); onOpenWarung(match.warung.id); } }}>@{text.slice(match.start + 1, match.end)}</a>);
    cursor = match.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.length ? parts : text;
}

function FeedVideo({ post }) {
  const videoRef = useRef(null);
  const [playbackState, setPlaybackState] = useState('paused');

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (playbackState === 'playing') {
      video.pause();
      setPlaybackState('paused');
      return;
    }
    if (playbackState === 'ended') video.currentTime = 0;
    try {
      await video.play();
      setPlaybackState('playing');
    } catch {
      setPlaybackState('paused');
    }
  }

  const action = playbackState === 'playing'
    ? { label: 'Jeda video', text: 'Jeda', Icon: Pause }
    : playbackState === 'ended'
      ? { label: 'Putar ulang video', text: 'Putar ulang', Icon: RotateCcw }
      : { label: 'Putar video', text: 'Putar', Icon: Play };
  const ActionIcon = action.Icon;
  const statusText = playbackState === 'playing' ? 'Sedang diputar' : playbackState === 'ended' ? 'Video selesai' : 'Dijeda';

  return <div className="feed-video-frame">
    <video
      ref={videoRef}
      src={post.videoURL}
      poster={post.videoThumbnailURL || undefined}
      playsInline
      preload="none"
      style={{ aspectRatio: 'auto' }}
      aria-label="Video obrolan WarkopLink"
      onPlay={() => setPlaybackState('playing')}
      onPause={() => { if (!videoRef.current?.ended) setPlaybackState('paused'); }}
      onEnded={() => setPlaybackState('ended')}
    />
    <div className="feed-video-controls">
      <button type="button" className="feed-video-toggle" onClick={togglePlayback} aria-label={action.label}>
        <ActionIcon size={18} aria-hidden="true"/>
        <span>{action.text}</span>
      </button>
      <span className="feed-video-status" role="status" aria-live="polite">{statusText}</span>
    </div>
  </div>;
}

// Tampilan satu status; state dan operasi tetap dimiliki App agar data tersinkron antarpengguna.
export default function ChatPostCard({
  post, user, relativePostTime, openPostMenuId, setOpenPostMenuId, openAuth, setNotice, verifiedWarungs = [], onOpenWarung, onOpenProfile, onOpenMention,
  reportingPostId, setReportingPostId, reportReason, setReportReason, sharePost, postReactions,
  reactionSummaries, handleReactPost, likeCounts, replyCounts, likedPosts, handleLikePost,
  openReplyPage,
  handleReportPost, reporting, deleteConfirmId, setDeleteConfirmId, deletingPostId,
  handleDeletePost, onEditPost
}) {
  const ownPost = Boolean(user?.uid && user.uid === post.authorId);
  const commentCount = replyCounts[post.id] ?? post.commentCount ?? 0;
  const summary = reactionSummaries?.[post.id];
  const reactions = { ...EMPTY_REACTIONS, ...(summary?.reactions || post.reactions || {}) };
  const totalReactions = summary?.totalReactions ?? post.totalReactions ?? likeCounts[post.id] ?? 0;
  const menuTriggerRef = useRef(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [moreEmojisOpen, setMoreEmojisOpen] = useState(false);
  const [rsvpStatus, setRsvpStatus] = useState('');
  const [rsvpCount, setRsvpCount] = useState(null);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const rsvpLock = useRef(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(post.body || '');
  const [editTopic, setEditTopic] = useState(displayTopic(post.topic, post.postType));
  const [editType, setEditType] = useState(post.postType || POST_SUBTYPES[displayTopic(post.topic, post.postType)]?.[0] || '');
  const [editLocation, setEditLocation] = useState(post.location || '');
  const [editDate, setEditDate] = useState(post.eventDate || '');
  const [editEventStartAt, setEditEventStartAt] = useState(post.eventStartAt || '');
  const [editEventEndAt, setEditEventEndAt] = useState(post.eventEndAt || '');
  const [editEventKind, setEditEventKind] = useState(post.eventKind || 'Nobar');
  const [editEventCapacity, setEditEventCapacity] = useState(post.eventCapacity ? String(post.eventCapacity) : '');
  const [editEventStatus, setEditEventStatus] = useState(post.eventStatus === 'cancelled' ? 'cancelled' : 'scheduled');
  const [editPrice, setEditPrice] = useState(post.price || '');
  const [editWorkType, setEditWorkType] = useState(post.workType || '');
  const [editContact, setEditContact] = useState(post.contact || '');

  useEffect(() => {
    if (!db || displayTopic(post.topic, post.postType) !== 'Info & Acara') return undefined;
    const attendeesQuery = query(collection(db, 'posts', post.id, 'eventRsvps'), where('status', '==', 'going'));
    const stopCount = onSnapshot(attendeesQuery, snapshot => setRsvpCount(snapshot.size), () => setRsvpCount(0));
    if (!user?.uid) {
      setRsvpStatus('');
      return () => stopCount();
    }
    const stopMine = onSnapshot(doc(db, 'posts', post.id, 'eventRsvps', user.uid), snapshot => {
      setRsvpStatus(snapshot.exists() ? snapshot.data().status || '' : '');
    }, () => setRsvpStatus(''));
    return () => { stopCount(); stopMine(); };
  }, [post.id, post.topic, user?.uid]);

  async function changeRsvp(nextStatus) {
    if (!user?.uid) {
      openAuth(false);
      setNotice('Masuk untuk menyatakan kehadiran acara.');
      return;
    }
    if (!db || rsvpLoading || rsvpLock.current) return;
    rsvpLock.current = true;
    setRsvpLoading(true);
    const rsvpRef = doc(db, 'posts', post.id, 'eventRsvps', user.uid);
    try {
      if (rsvpStatus === nextStatus) {
        await deleteDoc(rsvpRef);
        setNotice('Status kehadiran acara dibatalkan.');
      } else {
        const payload = { uid: user.uid, status: nextStatus, updatedAt: serverTimestamp() };
        if (!rsvpStatus) payload.createdAt = serverTimestamp();
        await setDoc(rsvpRef, payload, { merge: true });
        setNotice(nextStatus === 'going' ? 'Kehadiran tersimpan dan tersinkron.' : 'Status Mungkin tersimpan dan tersinkron.');
      }
    } catch (error) {
      setNotice(error?.code === 'permission-denied'
        ? 'RSVP ditolak oleh aturan keamanan.'
        : 'Status kehadiran belum tersimpan. Coba lagi.');
    } finally {
      rsvpLock.current = false;
      setRsvpLoading(false);
    }
  }

  useEffect(() => {
    if (openPostMenuId !== post.id || !menuTriggerRef.current) return undefined;
    const updateMenuPosition = () => {
      const rect = menuTriggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPosition({
        top: Math.min(rect.bottom + 8, window.innerHeight - 120),
        right: Math.max(8, window.innerWidth - rect.right)
      });
    };
    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [openPostMenuId, post.id]);

  async function openCommentsForReply() {
    await openReplyPage(post);
  }

  async function openReplyComposer() {
    await openReplyPage(post, { focusComposer: true });
  }

  const category = displayTopic(post.topic, post.postType);
  const community = getCommunityById(post.communityId);
  const linkedWarung = post.warungId ? verifiedWarungs.find(warung => warung.id === post.warungId) : null;
  const eventStart = post.eventStartAt ? new Date(post.eventStartAt) : null;
  const validEventStart = eventStart && !Number.isNaN(eventStart.getTime());
  const parsedEventEnd = post.eventEndAt ? new Date(post.eventEndAt) : null;
  const eventEnd = parsedEventEnd && !Number.isNaN(parsedEventEnd.getTime())
    ? parsedEventEnd
    : validEventStart ? new Date(eventStart.getTime() + 2 * 60 * 60 * 1000) : null;
  const eventLifecycle = post.eventStatus === 'cancelled'
    ? { label: 'Dibatalkan', canRsvp: false }
    : !validEventStart ? { label: 'Waktu belum ditentukan', canRsvp: true }
      : Date.now() < eventStart.getTime() ? { label: 'Akan datang', canRsvp: true }
        : Date.now() <= eventEnd.getTime() ? { label: 'Sedang berlangsung', canRsvp: true }
          : { label: 'Acara selesai', canRsvp: false };
  const metaItems = [
    post.postType && { label: post.postType, icon: '✦' },
    post.eventDate && { label: post.eventDate, icon: '◷' },
    post.location && { label: post.location, icon: '⌖' },
    post.workType && { label: post.workType, icon: '↗' },
    post.price && { label: post.price, icon: 'Rp' }
  ].filter(Boolean);

  return <>
  <article id={`post-${post.id}`} className={`post-card post-card-category post-category-${POST_CATEGORY_CLASS[category] || 'ngopi'}`} key={post.id}>
    <button type="button" className="post-avatar post-profile-link" aria-label={`Lihat profil ${post.authorName || 'Anggota'}`} onClick={() => onOpenProfile?.({ uid: post.authorId, displayName: post.authorName, photoURL: post.authorPhotoURL })}>{post.authorPhotoURL ? <img src={post.authorPhotoURL} alt="" loading="lazy" /> : <span className="post-avatar-initial" aria-hidden="true">{avatarInitial(post)}</span>}</button>
    <div className="post-content">
      <div className="post-head">
        <div className="post-meta">
          <button type="button" className="post-author-profile" onClick={() => onOpenProfile?.({ uid: post.authorId, displayName: post.authorName, photoURL: post.authorPhotoURL })}>{post.authorName || 'Anggota SL'}</button><span className="post-category-label">{category}</span>{community && community.name !== category && <span className="post-community-label">{community.name}</span>}
          <small title={post.createdAt?.toDate?.()?.toLocaleString('id-ID') || ''}>{relativePostTime(post.createdAt)}</small>
        </div>
        <div className="post-menu-wrap">
          <button ref={menuTriggerRef} className="post-menu-trigger" type="button" aria-label="Opsi postingan" aria-expanded={openPostMenuId === post.id} onClick={() => setOpenPostMenuId(current => current === post.id ? '' : post.id)}><MoreHorizontal size={20}/></button>
          {openPostMenuId === post.id && menuPosition && typeof document !== 'undefined' && createPortal(
            <>
            <div className="post-menu-backdrop" aria-hidden="true" onMouseDown={event => event.preventDefault()} onClick={() => setOpenPostMenuId('')} />
            <div className="post-menu post-menu-portal" role="menu" style={{ position: 'fixed', top: menuPosition.top, right: menuPosition.right, zIndex: 50 }}>
              {ownPost
                ? <>
                    <button type="button" role="menuitem" onMouseDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); setOpenPostMenuId(''); setEditing(true); }}><MessageSquare size={14}/> Edit posting</button>
                    <button type="button" role="menuitem" onMouseDown={event => { event.stopPropagation(); }} onClick={(event) => { event.stopPropagation(); setOpenPostMenuId(''); setDeleteConfirmId(post.id); }}><Trash2 size={14}/> Hapus obrolan</button>
                  </>
                : <button type="button" role="menuitem" onMouseDown={event => { event.stopPropagation(); }} onClick={(event) => { event.stopPropagation(); setOpenPostMenuId(''); if (!user) { openAuth(false); setNotice('Masuk terlebih dahulu untuk melaporkan obrolan.'); return; } setReportingPostId(current => current === post.id ? '' : post.id); setReportReason('Spam atau promosi berulang'); }}>⚑ Laporkan obrolan</button>}
              <button type="button" role="menuitem" onMouseDown={event => { event.stopPropagation(); }} onClick={(event) => { event.stopPropagation(); setOpenPostMenuId(''); sharePost(post); }}><Share2 size={14}/> Bagikan</button>
            </div>
            </>,
            document.body
          )}
        </div>
      </div>
      {editing ? <form className="post-edit-form" onSubmit={async event => {
        const saved = await onEditPost(event, post, { body: editBody, topic: editTopic, postType: editType, location: editLocation, eventDate: editDate, eventStartAt: editEventStartAt, eventEndAt: editEventEndAt, eventKind: editEventKind, eventCapacity: editEventCapacity, eventStatus: editEventStatus, price: editPrice, workType: editWorkType, contact: editContact });
        if (saved) setEditing(false);
      }}>
        <label>Isi posting<textarea aria-label="Edit isi posting" value={editBody} onChange={event => setEditBody(event.target.value)} maxLength={2000} rows={4} required /></label>
        <label>Kategori<select aria-label="Edit kategori" value={editTopic} onChange={event => { setEditTopic(event.target.value); setEditType(POST_SUBTYPES[event.target.value]?.[0] || ''); }}>{POST_TOPICS.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
        <label>Jenis posting<select aria-label="Edit jenis posting" value={editType} onChange={event => setEditType(event.target.value)}>{(POST_SUBTYPES[editTopic] || []).map(item => <option key={item} value={item}>{item}</option>)}</select></label>
        <label>Area / lokasi<input aria-label="Edit lokasi" value={editLocation} onChange={event => setEditLocation(event.target.value)} maxLength={160}/></label>
        <label>Waktu / tanggal<input aria-label="Edit waktu" value={editDate} onChange={event => setEditDate(event.target.value)} maxLength={40}/></label>
        {editTopic === 'Info & Acara' && <>
          <label>Jenis acara<select aria-label="Edit jenis acara" value={editEventKind} onChange={event => setEditEventKind(event.target.value)}>{['Nobar', 'Musik', 'Turnamen', 'Komunitas', 'Promo warkop', 'Lainnya'].map(kind => <option key={kind} value={kind}>{kind}</option>)}</select></label>
          <label>Mulai acara<input aria-label="Edit waktu mulai acara" type="datetime-local" value={editEventStartAt} onChange={event => setEditEventStartAt(event.target.value)} /></label>
          <label>Selesai acara<input aria-label="Edit waktu selesai acara" type="datetime-local" value={editEventEndAt} min={editEventStartAt || undefined} onChange={event => setEditEventEndAt(event.target.value)} /></label>
          <label>Kapasitas peserta<input aria-label="Edit kapasitas peserta" type="number" min="1" max="10000" step="1" value={editEventCapacity} onChange={event => setEditEventCapacity(event.target.value)} placeholder="Tanpa batas khusus" /></label>
          <label>Status acara<select aria-label="Edit status acara" value={editEventStatus} onChange={event => setEditEventStatus(event.target.value)}><option value="scheduled">Terjadwal</option><option value="cancelled">Dibatalkan</option></select></label>
        </>}
        <label>Harga<input aria-label="Edit harga" value={editPrice} onChange={event => setEditPrice(event.target.value)} maxLength={60}/></label>
        <label>Tipe kerja<input aria-label="Edit tipe kerja" value={editWorkType} onChange={event => setEditWorkType(event.target.value)} maxLength={60}/></label>
        <label>Kontak (HTTPS atau @akun)<input aria-label="Edit kontak" value={editContact} onChange={event => setEditContact(event.target.value)} maxLength={240}/></label>
        <div className="report-form-actions"><button className="button button-dark" type="submit">Simpan perubahan</button><button className="button button-quiet" type="button" onClick={() => setEditing(false)}>Batal</button></div>
      </form> : <p>{renderMemberMentions(renderWarungMentions(post.body, verifiedWarungs, onOpenWarung), onOpenMention)}</p>}
      {!editing && category === 'Info & Acara' && post.warungId && <div className="event-organizer">
        <button type="button" className="event-organizer-link" onClick={() => onOpenWarung?.(post.warungId)} aria-label={`Lihat profil warkop ${linkedWarung?.name || 'penyelenggara'}`}>
          <span className="event-organizer-avatar">{linkedWarung?.photos?.[0] ? <img src={linkedWarung.photos[0]} alt="" loading="lazy"/> : <Store size={17}/>}</span>
          <span className="event-organizer-copy"><small>Diselenggarakan oleh</small><strong>{linkedWarung?.name || 'Warkop penyelenggara'}</strong></span>
          <span className="event-organizer-action">Lihat Profil Warkop ↗</span>
        </button>
      </div>}
      {!editing && post.eventPhotoURL && <div className="event-post-image"><img src={post.eventPhotoURL} alt={`Poster acara ${post.eventKind || "warkop"}`} loading="lazy" /></div>}
      {!editing && post.videoURL && <FeedVideo post={post} />}
      {!editing && metaItems.length > 0 && <div className="post-detail-row" aria-label="Detail posting">
        {metaItems.map(item => <span key={item.label}><span aria-hidden="true">{item.icon}</span>{item.label}</span>)}
      </div>}
      {['Jual Beli & Jasa Lokal', 'Loker'].includes(category) && post.contact && (/^https:\/\//i.test(post.contact)
        ? <a className="post-contact-link" href={post.contact} target="_blank" rel="noopener noreferrer">{category === 'Loker' ? 'Lihat lowongan / kontak' : 'Lihat kontak'} <span aria-hidden="true">↗</span></a>
        : <button className="post-contact-link" type="button" onClick={async () => {
            try {
              if (!navigator.clipboard?.writeText) { setNotice(`Kontak: ${post.contact}. Salin secara manual.`); return; }
              await navigator.clipboard.writeText(post.contact);
              setNotice('Kontak berhasil disalin.');
            } catch { setNotice(`Kontak: ${post.contact}. Salin secara manual.`); }
          }}>Salin kontak {post.contact}</button>)}

      <div className="post-actions" aria-label="Aksi postingan">
        <div className="post-action-wrap">
          <LikeSummary post={post} user={user} liked={likedPosts[post.id]} count={totalReactions} onToggleLike={() => handleLikePost(post)} openAuth={openAuth} setNotice={setNotice} onOpenProfile={onOpenProfile} />
        </div>
        <div className="post-action-wrap">
          <button className="post-action post-icon-action" type="button" onClick={openCommentsForReply} aria-label={`Komentar, ${commentCount.toLocaleString('id-ID')}`}>
            <MessageSquare size={18} strokeWidth={1.8} aria-hidden="true"/><span className="post-action-count">{commentCount.toLocaleString('id-ID')}</span>
          </button>
        </div>
        <div className="post-action-wrap">
          <button className="post-action post-icon-action" type="button" onClick={openReplyComposer} aria-label="Balas"><Send size={18} strokeWidth={1.8} aria-hidden="true"/></button>
        </div>
        <div className="post-action-wrap">
          <button className="post-action post-icon-action" type="button" onClick={() => sharePost(post)} aria-label="Bagikan postingan"><Share2 size={18} strokeWidth={1.8} aria-hidden="true"/></button>
        </div>
      </div>
      {category === 'Info & Acara' && <div className={"event-action-row event-card-actions" + (eventLifecycle.label === 'Dibatalkan' ? ' event-cancelled' : '')}>
        <div className="event-lifecycle-row">
          {post.eventKind && <span className="event-kind-pill">{post.eventKind}</span>}
          <span className={"event-lifecycle-pill" + (eventLifecycle.label === 'Dibatalkan' ? ' is-cancelled' : eventLifecycle.label === 'Acara selesai' ? ' is-ended' : '')} role="status">{eventLifecycle.label}</span>
        </div>
        {validEventStart && <span className="event-time-label">{eventStart.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}{eventEnd ? ' – ' + eventEnd.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''}</span>}
        {Number.isFinite(post.eventCapacity) && post.eventCapacity > 0 && <span className="event-capacity-label">Maks. {post.eventCapacity} orang</span>}
        {eventLifecycle.canRsvp && <>
          <div className="event-rsvp-primary">
            <button className="button button-dark" type="button" aria-pressed={rsvpStatus === 'going'} disabled={rsvpLoading} aria-busy={rsvpLoading} onClick={() => changeRsvp('going')}>{rsvpLoading ? 'Menyimpan…' : rsvpStatus === 'going' ? '✓ Anda ikut' : 'Ikut acara'}</button>
            <button className="button button-quiet" type="button" aria-pressed={rsvpStatus === 'maybe'} disabled={rsvpLoading} aria-busy={rsvpLoading} onClick={() => changeRsvp('maybe')}>{rsvpLoading ? 'Menyimpan…' : rsvpStatus === 'maybe' ? '✓ Mungkin' : 'Mungkin'}</button>
          </div>
          {typeof rsvpCount === 'number' && <span className="event-rsvp-count" aria-live="polite">{rsvpCount.toLocaleString('id-ID')} ikut</span>}
          {rsvpLoading && <small className="event-rsvp-pending" role="status" aria-live="polite">Menyimpan kehadiran ke server…</small>}
        </>}
        {validEventStart && eventLifecycle.label !== 'Dibatalkan' && <div className="event-calendar-actions"><a className="button button-quiet" href={calendarLink(post)} target="_blank" rel="noopener noreferrer" aria-label="Tambah acara ke Google Calendar" title="Buka Google Calendar dengan detail acara terisi">Tambah ke kalender</a><button className="button button-quiet" type="button" onClick={() => setNotice(downloadIcs(post) ? 'File kalender acara berhasil disiapkan.' : 'Tanggal acara belum valid.')} title="Unduh file untuk aplikasi kalender lain">Unduh .ics</button></div>}
      </div>}
      {category === 'Jual Beli & Jasa Lokal' && normalizedWhatsAppNumber(post.contact) && <div className="event-action-row">
        <a className="button button-dark" href={`https://wa.me/${normalizedWhatsAppNumber(post.contact)}`} target="_blank" rel="noopener noreferrer" aria-label="Hubungi penjual melalui WhatsApp">Chat WhatsApp</a>
      </div>}
      {reportingPostId === post.id && <form className="report-form" onSubmit={event => handleReportPost(event, post)}><label>Alasan laporan<select aria-label="Alasan laporan" value={reportReason} onChange={event => setReportReason(event.target.value)}><option>Spam atau promosi berulang</option><option>Pelecehan atau ujaran kebencian</option><option>Informasi berbahaya atau menyesatkan</option><option>Lainnya</option></select></label><div className="report-form-actions"><button className="button button-dark" type="submit" disabled={reporting}>{reporting ? 'Mengirim laporan…' : 'Kirim laporan'}</button><button className="button button-quiet" type="button" onClick={() => setReportingPostId('')} disabled={reporting}>Batal</button></div></form>}
      {deleteConfirmId === post.id && <div className="delete-confirm" role="group" aria-label="Konfirmasi hapus obrolan"><p>Hapus obrolan ini secara permanen?</p><div className="report-form-actions"><button className="button button-reject" type="button" onClick={() => handleDeletePost(post)} disabled={deletingPostId === post.id}>{deletingPostId === post.id ? 'Menghapus…' : 'Ya, hapus'}</button><button className="button button-quiet" type="button" onClick={() => setDeleteConfirmId('')} disabled={deletingPostId === post.id}>Batal</button></div></div>}
    </div>
  </article>
  </>;
}
