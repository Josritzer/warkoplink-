import { MessageSquare, MoreHorizontal, Send, Share2, SmilePlus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡'];
const REACTION_FIELDS = {
  like: '👍', love: '❤️', haha: '😂', wow: '😮', sad: '😢', angry: '😡'
};
const EMPTY_REACTIONS = { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 };
// Referensi tunggal untuk "belum ada komentar". Literal `[]` baru di setiap render akan membuat
// useEffect di bawah berjalan terus-menerus (setComments([]) -> render ulang -> `[]` baru -> ...).
const NO_COMMENTS = [];

// Tampilan satu status; state dan operasi tetap dimiliki App agar data tersinkron antarpengguna.
export default function ChatPostCard({
  post, user, relativePostTime, openPostMenuId, setOpenPostMenuId, openAuth, setNotice,
  reportingPostId, setReportingPostId, reportReason, setReportReason, sharePost, postReactions,
  reactionSummaries, handleReactPost, likeCounts, replyCounts, likedPosts,
  openReplies, closeReplies, repliesByPost, replyingPostId, replyDraft, setReplyDraft, handleReply,
  handleReportPost, reporting, deleteConfirmId, setDeleteConfirmId, deletingPostId,
  handleDeletePost
}) {
  const ownPost = Boolean(user?.uid && user.uid === post.authorId);
  const replyRows = repliesByPost[post.id] || NO_COMMENTS;
  const commentCount = replyCounts[post.id] ?? post.commentCount ?? 0;
  const summary = reactionSummaries?.[post.id];
  const reactions = { ...EMPTY_REACTIONS, ...(summary?.reactions || post.reactions || {}) };
  const totalReactions = summary?.totalReactions ?? post.totalReactions ?? likeCounts[post.id] ?? 0;
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState(NO_COMMENTS);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const commentInputRef = useRef(null);
  const menuTriggerRef = useRef(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);

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

  useEffect(() => {
    setComments(showComments ? replyRows : NO_COMMENTS);
  }, [showComments, replyRows]);

  useEffect(() => {
    if (showComments) commentInputRef.current?.focus();
  }, [showComments]);

  async function toggleComments() {
    if (showComments) {
      setShowComments(false);
      setComments(NO_COMMENTS);
      closeReplies(post);
      return;
    }
    setShowComments(true);
    setCommentsLoading(true);
    try {
      const loaded = await openReplies(post);
      setComments(loaded || NO_COMMENTS);
    } finally {
      setCommentsLoading(false);
    }
  }

  async function openCommentsForReply() {
    if (showComments) {
      commentInputRef.current?.focus();
      return;
    }
    await toggleComments();
  }

  return <>
  <article className="post-card" key={post.id}>
    <div className="post-avatar">{post.authorPhotoURL ? <img src={post.authorPhotoURL} alt="" loading="lazy" /> : String(post.authorName || 'A').slice(0, 1).toUpperCase()}</div>
    <div className="post-content">
      <div className="post-head">
        <div className="post-meta">
          <b>{post.authorName || 'Anggota SL'}</b><span>{post.topic || 'Obrolan Umum'}</span>
          <small title={post.createdAt?.toDate?.()?.toLocaleString('id-ID') || ''}>{relativePostTime(post.createdAt)}</small>
        </div>
        <div className="post-menu-wrap">
          <button ref={menuTriggerRef} className="post-menu-trigger" type="button" aria-label="Opsi postingan" aria-expanded={openPostMenuId === post.id} onClick={() => setOpenPostMenuId(current => current === post.id ? '' : post.id)}><MoreHorizontal size={20}/></button>
          {openPostMenuId === post.id && menuPosition && typeof document !== 'undefined' && createPortal(
            <>
            <div className="post-menu-backdrop" aria-hidden="true" onMouseDown={event => event.preventDefault()} onClick={() => setOpenPostMenuId('')} />
            <div className="post-menu post-menu-portal" role="menu" style={{ position: 'fixed', top: menuPosition.top, right: menuPosition.right, zIndex: 50 }}>
              {ownPost
                ? <button type="button" role="menuitem" onMouseDown={event => { event.stopPropagation(); }} onClick={(event) => { event.stopPropagation(); setOpenPostMenuId(''); setDeleteConfirmId(post.id); }}><Trash2 size={14}/> Hapus obrolan</button>
                : <button type="button" role="menuitem" onMouseDown={event => { event.stopPropagation(); }} onClick={(event) => { event.stopPropagation(); setOpenPostMenuId(''); if (!user) { openAuth(false); setNotice('Masuk terlebih dahulu untuk melaporkan obrolan.'); return; } setReportingPostId(current => current === post.id ? '' : post.id); setReportReason('Spam atau promosi berulang'); }}>⚑ Laporkan obrolan</button>}
              <button type="button" role="menuitem" onMouseDown={event => { event.stopPropagation(); }} onClick={(event) => { event.stopPropagation(); setOpenPostMenuId(''); sharePost(post); }}><Share2 size={14}/> Bagikan</button>
            </div>
            </>,
            document.body
          )}
        </div>
      </div>
      <p>{post.body}</p>

      {totalReactions > 0 && <div className="post-reaction-summary animate-reaction-summary" aria-label="Ringkasan reaksi">
        <div className="post-reaction-counts">
          {Object.entries(REACTION_FIELDS).map(([field, emoji]) => reactions[field] > 0
            ? <span className="post-reaction-count" key={field}><span aria-hidden="true">{emoji}</span><span>{reactions[field]}</span></span>
            : null)}
        </div>
        <span className="post-reaction-total" aria-label={`${totalReactions} total reaksi`}>{totalReactions}</span>
      </div>}

      <div className="engagement-summary">
        <span aria-hidden="true"></span>
        {commentCount > 0 && <button className="engagement-comment-count" type="button" aria-expanded={showComments} onClick={toggleComments}>{commentCount} komentar</button>}
      </div>
      <div className="post-actions">
        <div className="post-action-wrap">
          {reactionPickerOpen && <div className="status-reactions" role="group" aria-label="Pilih reaksi">
            {EMOJIS.map(emoji => <button key={emoji} type="button" className={postReactions[post.id] === emoji ? 'status-reaction selected' : 'status-reaction'} aria-label={`Beri reaksi ${emoji}`} aria-pressed={postReactions[post.id] === emoji} onClick={() => { handleReactPost(post, emoji); setReactionPickerOpen(false); }}>{emoji}</button>)}
          </div>}
          <button className={reactionPickerOpen || likedPosts[post.id] ? 'post-action liked' : 'post-action'} type="button" aria-label="Reaksi" aria-expanded={reactionPickerOpen} onClick={() => setReactionPickerOpen(open => !open)}>{postReactions[post.id] ? <span className="reaction-action-emoji" aria-hidden="true">{postReactions[post.id]}</span> : <SmilePlus size={17}/>} <span>Reaksi</span></button>
        </div>
        <div className="post-action-wrap">
          <button className="post-action" type="button" aria-expanded={showComments} onClick={openCommentsForReply}><MessageSquare size={17}/> <span>Balas</span></button>
        </div>
        <div className="post-action-wrap">
          <button className="post-action" type="button" onClick={() => sharePost(post)}><Share2 size={17}/> <span>Bagikan</span></button>
        </div>
      </div>
      {showComments && <div className="comment-section animate-slideDown" aria-label="Komentar dan balasan">
        {commentsLoading
          ? <div className="comment-skeleton" role="status" aria-label="Memuat komentar"><span/><span/></div>
          : comments.length === 0
            ? <p className="comment-empty">Belum ada komentar. Mulai percakapan ini.</p>
            : comments.map(reply => <div className="inline-reply" key={reply.id}>
                <div className="inline-reply-avatar">{reply.authorPhotoURL ? <img src={reply.authorPhotoURL} alt="" loading="lazy"/> : String(reply.authorName || 'A').slice(0, 1).toUpperCase()}</div>
                <div className="inline-reply-body"><b>{reply.authorName || 'Anggota komunitas'}</b><p>{reply.body}</p><small>{reply.pending ? 'Mengirim…' : reply.createdAt?.toDate?.() ? relativePostTime(reply.createdAt) : 'Baru saja'}</small></div>
              </div>)}
      </div>}
      {reportingPostId === post.id && <form className="report-form" onSubmit={event => handleReportPost(event, post)}><label>Alasan laporan<select aria-label="Alasan laporan" value={reportReason} onChange={event => setReportReason(event.target.value)}><option>Spam atau promosi berulang</option><option>Pelecehan atau ujaran kebencian</option><option>Informasi berbahaya atau menyesatkan</option><option>Lainnya</option></select></label><div className="report-form-actions"><button className="button button-dark" type="submit" disabled={reporting}>{reporting ? 'Mengirim laporan…' : 'Kirim laporan'}</button><button className="button button-quiet" type="button" onClick={() => setReportingPostId('')} disabled={reporting}>Batal</button></div></form>}
      {deleteConfirmId === post.id && <div className="delete-confirm" role="group" aria-label="Konfirmasi hapus obrolan"><p>Hapus obrolan ini secara permanen?</p><div className="report-form-actions"><button className="button button-reject" type="button" onClick={() => handleDeletePost(post)} disabled={deletingPostId === post.id}>{deletingPostId === post.id ? 'Menghapus…' : 'Ya, hapus'}</button><button className="button button-quiet" type="button" onClick={() => setDeleteConfirmId('')} disabled={deletingPostId === post.id}>Batal</button></div></div>}
    </div>
  </article>
  {showComments && <form className="reply-form reply-composer-sticky" onSubmit={async event => {
    event.preventDefault();
    const sent = await handleReply(event, post);
    if (sent) commentInputRef.current?.blur();
  }}>
    <input className="tulis-komentar" ref={commentInputRef} autoFocus aria-label="Tulis komentar" value={replyDraft} onChange={event => setReplyDraft(event.target.value)} maxLength={1000} placeholder="Tulis komentar…"/>
    <button className="button button-dark" type="submit" disabled={!replyDraft.trim()} aria-label="Kirim komentar"><Send size={15}/></button>
  </form>}
  </>;
}