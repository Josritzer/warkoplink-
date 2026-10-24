import { Trash2 } from 'lucide-react';
import { REPORT_REASONS, formatPostTime, isOwnPost } from '../lib.js';

// Satu obrolan. Penulis melihat tombol Hapus; anggota lain melihat tombol Laporkan.
export default function PostCard({ post, user, chat, now }) {
  const own = isOwnPost(post, user);
  const time = formatPostTime(post.createdAt, now);
  const reportOpen = chat.reportingPostId === post.id;
  const deleteOpen = chat.confirmDeleteId === post.id;
  const deleting = chat.deletingId === post.id;

  return <article className="post-card">
    <div className="post-avatar">{String(post.authorName || 'A').slice(0, 1).toUpperCase()}</div>
    <div className="post-content">
      <div className="post-meta">
        <b>{post.authorName || 'Anggota SL'}</b>
        <span>{post.topic || 'Obrolan Umum'}</span>
        {time && <time className="post-time" dateTime={time.iso || undefined} title={time.title}>{time.label}</time>}
      </div>
      <p>{post.body}</p>
      <div className="post-actions">
        {own
          ? <button className="button button-quiet" type="button" onClick={() => chat.askDelete(post)}><Trash2 size={14}/> Hapus</button>
          : <button className="button button-quiet" type="button" onClick={() => chat.toggleReport(post)}>Laporkan</button>}
      </div>
      {deleteOpen && <div className="delete-confirm" role="group" aria-label="Konfirmasi hapus obrolan">
        <p>Hapus obrolan ini secara permanen?</p>
        <div className="report-form-actions">
          <button className="button button-reject" type="button" onClick={() => chat.confirmDelete(post)} disabled={deleting}>{deleting ? 'Menghapus…' : 'Ya, hapus'}</button>
          <button className="button button-quiet" type="button" onClick={chat.cancelDelete} disabled={deleting}>Batal</button>
        </div>
      </div>}
      {reportOpen && <form className="report-form" onSubmit={(event) => chat.submitReport(event, post)}>
        <label>Alasan laporan
          <select aria-label="Alasan laporan" value={chat.reportReason} onChange={(event) => chat.setReportReason(event.target.value)}>
            {REPORT_REASONS.map((reason) => <option key={reason}>{reason}</option>)}
          </select>
        </label>
        <div className="report-form-actions">
          <button className="button button-dark" type="submit" disabled={chat.reporting}>{chat.reporting ? 'Mengirim laporan…' : 'Kirim laporan'}</button>
          <button className="button button-quiet" type="button" onClick={chat.closeReport} disabled={chat.reporting}>Batal</button>
        </div>
      </form>}
    </div>
  </article>;
}
