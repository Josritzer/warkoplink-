import { useEffect, useMemo, useState } from 'react';
import {
  collection, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp, writeBatch
} from 'firebase/firestore';
import { CheckCheck, Clock3, FileText, History, ShieldAlert } from 'lucide-react';

const STATUS = ['Baru', 'Ditinjau', 'Selesai'];

function formatDate(value) {
  if (!value || typeof value.toDate !== 'function') return 'Waktu server';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(value.toDate());
}

export default function ReportModerationPanel({ db, user, onNotice }) {
  const [reports, setReports] = useState([]);
  const [moderation, setModeration] = useState({});
  const [audit, setAudit] = useState([]);
  const [posts, setPosts] = useState({});
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    if (!db) {
      setError('Firebase belum dikonfigurasi.');
      setLoading(false);
      return undefined;
    }
    let reportsReady = false;
    let moderationReady = false;
    const finishLoading = () => { if (reportsReady && moderationReady) setLoading(false); };
    const reportsQuery = query(collection(db, 'postReports'), orderBy('createdAt', 'desc'), limit(50));
    const unsubscribeReports = onSnapshot(reportsQuery, (snapshot) => {
      const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      setReports(rows);
      reportsReady = true;
      finishLoading();
      rows.forEach(async (report) => {
        if (!report.targetPostId) return;
        try {
          const snapshot = await getDoc(doc(db, 'posts', report.targetPostId));
          setPosts((current) => ({ ...current, [report.targetPostId]: snapshot.exists() ? snapshot.data() : null }));
        } catch {
          setPosts((current) => ({ ...current, [report.targetPostId]: null }));
        }
      });
    }, () => {
      setError('Laporan obrolan tidak dapat dimuat. Pastikan akun memiliki klaim admin yang sah.');
      reportsReady = true;
      finishLoading();
    });
    const unsubscribeModeration = onSnapshot(query(collection(db, 'postReportModeration'), limit(100)), (snapshot) => {
      setModeration(Object.fromEntries(snapshot.docs.map((item) => [item.id, item.data()])));
      moderationReady = true;
      finishLoading();
    }, () => {
      setError('Status moderasi tidak dapat dimuat. Akses hanya tersedia untuk admin.');
      moderationReady = true;
      finishLoading();
    });
    const unsubscribeAudit = onSnapshot(query(collection(db, 'postReportAudit'), orderBy('createdAt', 'desc'), limit(100)), (snapshot) => {
      setAudit(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    }, () => setError('Riwayat moderasi tidak dapat dimuat.'));
    return () => {
      unsubscribeReports();
      unsubscribeModeration();
      unsubscribeAudit();
    };
  }, [db]);

  const counts = useMemo(() => {
    const result = { Baru: 0, Ditinjau: 0, Selesai: 0 };
    reports.forEach((report) => { result[moderation[report.id]?.status || 'Baru'] += 1; });
    return result;
  }, [reports, moderation]);

  async function updateStatus(report, nextStatus) {
    if (!db || !user || busyId || !STATUS.includes(nextStatus)) return;
    const previousStatus = moderation[report.id]?.status || 'Baru';
    if (previousStatus === nextStatus) return;
    const note = (notes[report.id] || '').trim();
    if (note.length > 500) {
      onNotice('Catatan moderasi maksimal 500 karakter.');
      return;
    }
    setBusyId(report.id);
    try {
      const batch = writeBatch(db);
      const stateRef = doc(db, 'postReportModeration', report.id);
      const auditRef = doc(collection(db, 'postReportAudit'));
      batch.set(stateRef, {
        reportId: report.id,
        status: nextStatus,
        updatedBy: user.uid,
        updatedAt: serverTimestamp(),
        latestAuditId: auditRef.id
      });
      batch.set(auditRef, {
        reportId: report.id,
        previousStatus,
        newStatus: nextStatus,
        actorUid: user.uid,
        note,
        createdAt: serverTimestamp()
      });
      await batch.commit();
      setNotes((current) => ({ ...current, [report.id]: '' }));
      onNotice('Status laporan diperbarui dan catatan audit tersimpan.');
    } catch (err) {
      onNotice(err?.code === 'permission-denied'
        ? 'Perubahan ditolak aturan keamanan. Pastikan klaim admin masih aktif.'
        : 'Status belum tersimpan. Status dan audit tetap atomik; coba lagi.');
    } finally {
      setBusyId('');
    }
  }

  return <section className="report-moderation-section" aria-labelledby="report-moderation-title">
    <div className="admin-subheading"><h3 id="report-moderation-title"><ShieldAlert size={18}/> Moderasi laporan obrolan</h3><span>{reports.length} / 50 laporan</span></div>
    <div className="report-counts" aria-label="Ringkasan status">
      {STATUS.map((status) => <span key={status} className={`report-count report-count-${status.toLowerCase()}`}>{status}: <b>{counts[status]}</b></span>)}
    </div>
    <p className="report-moderation-help">Laporan asli disimpan sebagai arsip. Perubahan status dicatat terpisah dalam audit yang tidak dapat diubah.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading && <p role="status">Memuat laporan…</p>}
    {!loading && reports.length === 0 && <div className="empty-state"><h3>Belum ada laporan obrolan</h3><p>Laporan baru akan muncul di sini.</p></div>}
    <div className="report-moderation-list">{reports.map((report) => {
      const status = moderation[report.id]?.status || 'Baru';
      const post = posts[report.targetPostId];
      return <article className="report-moderation-card" key={report.id}>
        <div className="report-moderation-heading"><div><b>{report.targetPostId || report.id}</b><small>Dilaporkan {formatDate(report.createdAt)}</small></div><span className={`report-status report-status-${status.toLowerCase()}`}>{status.toUpperCase()}</span></div>
        <p><strong>Alasan:</strong> {report.reason || 'Tidak disebutkan'}</p>
        <p><strong>Pelapor UID:</strong> {report.reporterUid || 'Tidak tersedia'} · <strong>Penulis UID:</strong> {report.targetAuthorId || 'Tidak tersedia'}</p>
        {post ? <blockquote className="reported-post"><FileText size={15}/><span>{post.body || 'Isi postingan kosong'}</span></blockquote> : <p className="reported-post-missing">Postingan asli sudah tidak tersedia atau tidak dapat dimuat.</p>}
        <label>Catatan moderasi (opsional, maksimal 500 karakter)<textarea rows={2} maxLength={500} value={notes[report.id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [report.id]: event.target.value }))} placeholder="Catatan pemeriksaan"/></label>
        <div className="admin-actions">
          {status === 'Baru' && <button className="button button-dark" disabled={Boolean(busyId)} onClick={() => updateStatus(report, 'Ditinjau')}><Clock3 size={15}/>{busyId === report.id ? 'Menyimpan…' : 'Tandai ditinjau'}</button>}
          {status !== 'Selesai' && <button className="button button-dark" disabled={Boolean(busyId)} onClick={() => updateStatus(report, 'Selesai')}><CheckCheck size={15}/>{busyId === report.id ? 'Menyimpan…' : 'Selesaikan'}</button>}
        </div>
      </article>;
    })}</div>
    <div className="admin-subheading"><h3><History size={18}/> Audit moderasi laporan</h3><span>{audit.length} / 100 peristiwa</span></div>
    {audit.length === 0 && !loading && <p className="report-moderation-help">Belum ada tindakan moderasi.</p>}
    <div className="report-moderation-audit">{audit.map((item) => <article className="admin-audit-row" key={item.id}>
      <div><b>{item.reportId}</b><small>{formatDate(item.createdAt)} · Admin UID: {item.actorUid}</small><small>{item.previousStatus} → {item.newStatus}</small>{item.note && <p>{item.note}</p>}</div>
      <span className={item.newStatus === 'Selesai' ? 'admin-status-verified' : 'admin-status-pending'}>{item.newStatus.toUpperCase()}</span>
    </article>)}</div>
  </section>;
}
