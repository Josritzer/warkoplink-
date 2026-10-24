import { Heart, MessageSquare, MoreHorizontal, Send, Share2, Trash2 } from 'lucide-react';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡'];

// Tampilan satu status; state dan operasi tetap dimiliki App agar komentar/reaksi lama tidak terputus.
export default function ChatPostCard({
  post, user, relativePostTime, openPostMenuId, setOpenPostMenuId, openAuth, setNotice,
  reportingPostId, setReportingPostId, reportReason, setReportReason, sharePost, postReactions,
  handleReactPost, likeCounts, replyCounts, expandedReplies, likedPosts, handleLikePost,
  openReplies, repliesByPost, replyingPostId, replyDraft, setReplyDraft, handleReply,
  handleReportPost, reporting, deleteConfirmId, setDeleteConfirmId, deletingPostId,
  handleDeletePost
}) {
  const ownPost = Boolean(user?.uid && user.uid === post.authorId);
  const replyRows = repliesByPost[post.id] || [];
  const showAllReplies = Boolean(expandedReplies[post.id]);

  return <article className="post-card" key={post.id}>
    <div className="post-avatar">{post.authorPhotoURL ? <img src={post.authorPhotoURL} alt="" loading="lazy" /> : String(post.authorName || 'A').slice(0, 1).toUpperCase()}</div>
    <div className="post-content">
      <div className="post-head">
        <div className="post-meta">
          <b>{post.authorName || 'Anggota SL'}</b><span>{post.topic || 'Obrolan Umum'}</span>
          <small title={post.createdAt?.toDate?.()?.toLocaleString('id-ID') || ''}>{relativePostTime(post.createdAt)}</small>
        </div>
        <div className="post-menu-wrap">
          <button className="post-menu-trigger" type="button" aria-label="Opsi postingan" aria-expanded={openPostMenuId === post.id} onClick={() => setOpenPostMenuId(current => current === post.id ? '' : post.id)}><MoreHorizontal size={20}/></button>
          {openPostMenuId === post.id && <div className="post-menu">
            {ownPost
              ? <button type="button" onClick={() => { setOpenPostMenuId(''); setDeleteConfirmId(post.id); }}><Trash2 size={14}/> Hapus obrolan</button>
              : <button type="button" onClick={() => { setOpenPostMenuId(''); if (!user) { openAuth(false); setNotice('Masuk terlebih dahulu untuk melaporkan obrolan.'); return; } setReportingPostId(current => current === post.id ? '' : post.id); setReportReason('Spam atau promosi berulang'); }}>⚑ Laporkan obrolan</button>}
            <button type="button" onClick={() => { setOpenPostMenuId(''); sharePost(post); }}><Share2 size={14}/> Bagikan</button>
          </div>}
        </div>
      </div>
      <p>{post.body}</p>
      <div className="status-reactions" role="group" aria-label="Reaksi pada status">
        {EMOJIS.map(emoji => <button key={emoji} type="button" className={postReactions[post.id] === emoji ? 'status-reaction selected' : 'status-reaction'} aria-label={`Beri reaksi ${emoji}`} aria-pressed={postReactions[post.id] === emoji} onClick={() => handleReactPost(post, emoji)}>{emoji}</button>)}
      </div>
      <div className="engagement-summary"><span>{(likeCounts[post.id] || 0) > 0 ? `${likeCounts[post.id]} reaksi` : ''}</span><span>{(replyCounts[post.id] || 0) > 0 ? `${replyCounts[post.id] >= 4 && !showAllReplies ? '3+' : replyCounts[post.id]} komentar` : ''}</span></div>
      <div className="post-actions">
        <button className={likedPosts[post.id] ? 'post-action liked' : 'post-action'} type="button" onClick={() => handleLikePost(post)}><Heart size={17} fill={likedPosts[post.id] ? 'currentColor' : 'none'}/> <span>Suka</span></button>
        <button className="post-action" type="button" onClick={() => openReplies(post)}><MessageSquare size={17}/> <span>Balas</span></button>
        <button className="post-action" type="button" onClick={() => sharePost(post)}><Share2 size={17}/> <span>Bagikan</span></button>
      </div>
      {replyRows.length > 0 && <div className="inline-replies" aria-label="Komentar dan balasan">
        {(showAllReplies ? replyRows : replyRows.slice(0, 4)).map(reply => <div className="inline-reply" key={reply.id}>
          <div className="inline-reply-avatar">{reply.authorPhotoURL ? <img src={reply.authorPhotoURL} alt="" loading="lazy"/> : String(reply.authorName || 'A').slice(0, 1).toUpperCase()}</div>
          <div className="inline-reply-body"><b>{reply.authorName || 'Anggota komunitas'}</b><p>{reply.body}</p><small>{reply.createdAt?.toDate?.() ? relativePostTime(reply.createdAt) : 'Baru saja'}</small></div>
        </div>)}
        {(replyRows.length >= 4 || (replyCounts[post.id] || 0) > 3) && !showAllReplies && <button className="show-more-replies" type="button" onClick={() => openReplies(post)}>Lihat semua komentar ({Math.max((replyCounts[post.id] || 0) - replyRows.length, 0) > 0 ? `${Math.max((replyCounts[post.id] || 0) - replyRows.length, 0)} lagi` : 'selengkapnya'})</button>}
      </div>}
      {replyingPostId === post.id && <form className="reply-form" onSubmit={event => handleReply(event, post)}><input aria-label="Tulis balasan" value={replyDraft} onChange={event => setReplyDraft(event.target.value)} maxLength={1000} placeholder="Tulis komentar atau balasan…"/><button className="button button-dark" type="submit" disabled={!replyDraft.trim()} aria-label="Kirim komentar"><Send size={15}/></button></form>}
      {reportingPostId === post.id && <form className="report-form" onSubmit={event => handleReportPost(event, post)}><label>Alasan laporan<select aria-label="Alasan laporan" value={reportReason} onChange={event => setReportReason(event.target.value)}><option>Spam atau promosi berulang</option><option>Pelecehan atau ujaran kebencian</option><option>Informasi berbahaya atau menyesatkan</option><option>Lainnya</option></select></label><div className="report-form-actions"><button className="button button-dark" type="submit" disabled={reporting}>{reporting ? 'Mengirim laporan…' : 'Kirim laporan'}</button><button className="button button-quiet" type="button" onClick={() => setReportingPostId('')} disabled={reporting}>Batal</button></div></form>}
      {deleteConfirmId === post.id && <div className="delete-confirm" role="group" aria-label="Konfirmasi hapus obrolan"><p>Hapus obrolan ini secara permanen?</p><div className="report-form-actions"><button className="button button-reject" type="button" onClick={() => handleDeletePost(post)} disabled={deletingPostId === post.id}>{deletingPostId === post.id ? 'Menghapus…' : 'Ya, hapus'}</button><button className="button button-quiet" type="button" onClick={() => setDeleteConfirmId('')} disabled={deletingPostId === post.id}>Batal</button></div></div>}
    </div>
  </article>;
}
