import { useEffect, useState } from 'react';
import {
  collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, where, writeBatch
} from 'firebase/firestore';
import { CheckCircle2, Clock3, History, ShieldAlert, XCircle } from 'lucide-react';

function formatDate(value) {
  if (!value || typeof value.toDate !== 'function') return 'Waktu server';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(value.toDate());
}

export default function AdminPanel({ db, user, onNotice }) {
  const [pending, setPending] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [loadingAudit, setLoadingAudit] = useState(true);
  const [error, setError] = useState('');
  const [reasons, setReasons] = useState({});
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    if (!db) {
      setError('Firebase belum dikonfigurasi.');
      setLoadingPending(false);
      setLoadingAudit(false);
      return undefined;
    }
    const pendingQuery = query(collection(db, 'warungs'), where('verificationStatus', '==', 'pending'), limit(50));
    const unsubscribePending = onSnapshot(pendingQuery, (snapshot) => {
      const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      rows.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setPending(rows);
      setLoadingPending(false);
    }, () => {
      setError('Daftar pendaftaran tidak dapat dimuat. Pastikan akun admin sudah diaktifkan dan token diperbarui.');
      setLoadingPending(false);
    });
    const auditQuery = query(collection(db, 'verificationAudit'), orderBy('createdAt', 'desc'), limit(50));
    const unsubscribeAudit = onSnapshot(auditQuery, (snapshot) => {
      setAudit(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      setLoadingAudit(false);
    }, () => {
      setError('Riwayat audit tidak dapat dimuat. Akses audit hanya tersedia untuk admin sah.');
      setLoadingAudit(false);
    });
    return () => {
      unsubscribePending();
      unsubscribeAudit();
    };
  }, [db]);

  async function decide(warung, nextStatus) {
    if (!db || !user || busyId) return;
    const reason = (reasons[warung.id] || '').trim();
    if (nextStatus === 'rejected' && !reason) {
      onNotice('Isi alasan penolakan terlebih dahulu agar keputusan tercatat jelas.');
      return;
    }
    if (reason.length > 500) {
      onNotice('Alasan maksimal 500 karakter.');
      return;
    }
    setBusyId(warung.id);
    try {
      const batch = writeBatch(db);
      const auditRef = doc(collection(db, 'verificationAudit'));
      batch.update(doc(db, 'warungs', warung.id), {
        verificationStatus: nextStatus,
        verificationAuditId: auditRef.id,
        updatedAt: serverTimestamp()
      });
      batch.set(auditRef, {
        warungId: warung.id,
        warungName: String(warung.name || '').slice(0, 100),
        previousStatus: 'pending',
        newStatus: nextStatus,
        actorUid: user.uid,
        reason,
        createdAt: serverTimestamp()
      });
      await batch.commit();
      setReasons((current) => ({ ...current, [warung.id]: '' }));
      onNotice(nextStatus === 'verified'
        ? 'Warkop disetujui. Catatan audit tersimpan.'
        : 'Warkop ditolak. Alasan dan catatan audit tersimpan.');
    } catch (err) {
      onNotice(err?.code === 'permission-denied'
        ? 'Keputusan ditolak oleh aturan keamanan. Periksa hak admin dan coba masuk kembali.'
        : 'Keputusan belum tersimpan. Status dan audit tidak diubah sebagian; coba lagi.');
    } finally {
      setBusyId('');
    }
  }

  return <section className="content-section admin-section">
    <span className="eyebrow">PENGELOLAAN TERBATAS</span>
    <h2>Panel admin</h2>
    <p>Verifikasi pendaftaran dan periksa riwayat keputusan. Perubahan status dan catatan audit disimpan dalam satu batch atomik.</p>
    <div className="admin-security-note"><ShieldAlert size={18}/><span>Akses menggunakan klaim admin dari Firebase Authentication. Panel ini tidak memberikan hak admin kepada pengguna.</span></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="admin-subheading"><h3><Clock3 size={18}/> Pendaftaran menunggu</h3><span>{pending.length} / 50</span></div>
    {loadingPending && <p role="status">Memuat pendaftaran…</p>}
    {!loadingPending && pending.length === 0 && <div className="empty-state"><h3>Tidak ada pendaftaran menunggu</h3><p>Pendaftaran baru akan muncul di sini.</p></div>}
    <div className="admin-warung-list">{pending.map((warung) => <article className="admin-warung-card" key={warung.id}>
      <div className="admin-warung-heading"><div><h4>{warung.name}</h4><small>Diajukan {formatDate(warung.createdAt)}</small></div><span className="admin-status-pending">MENUNGGU</span></div>
      <p>{warung.address}</p>
      <small>Pemilik UID: {warung.ownerUid}</small>
      <small>Koordinat: {warung.coordinates?.lat}, {warung.coordinates?.lng}</small>
      <small>Fasilitas: {(warung.facilities || []).join(', ') || 'Belum diisi'}</small>
      <small>Harga: {warung.priceRange || 'Belum diisi'}{warung.openingHours?.keterangan ? ' · Jam buka: ' + warung.openingHours.keterangan : ''}</small>
      <label>Catatan keputusan (maksimal 500 karakter)<textarea rows={2} maxLength={500} value={reasons[warung.id] || ''} onChange={(event) => setReasons((current) => ({ ...current, [warung.id]: event.target.value }))} placeholder="Catatan pemeriksaan atau alasan penolakan"/></label>
      <div className="admin-actions"><button className="button button-dark" disabled={Boolean(busyId)} onClick={() => decide(warung, 'verified')}><CheckCircle2 size={15}/>{busyId === warung.id ? 'Menyimpan…' : 'Setujui'}</button><button className="button button-reject" disabled={Boolean(busyId)} onClick={() => decide(warung, 'rejected')}><XCircle size={15}/>Tolak</button></div>
    </article>)}</div>
    <div className="admin-subheading"><h3><History size={18}/> Riwayat audit</h3><span>50 keputusan terbaru</span></div>
    {loadingAudit && <p role="status">Memuat riwayat audit…</p>}
    {!loadingAudit && audit.length === 0 && <div className="empty-state"><h3>Belum ada catatan audit</h3><p>Keputusan admin akan dicatat otomatis di sini.</p></div>}
    <div className="admin-audit-list">{audit.map((item) => <article className="admin-audit-row" key={item.id}>
      <div><b>{item.warungName || item.warungId}</b><small>{formatDate(item.createdAt)} · Admin UID: {item.actorUid}</small>{item.reason && <p>{item.reason}</p>}</div>
      <span className={item.newStatus === 'verified' ? 'admin-status-verified' : 'admin-status-rejected'}>{item.newStatus === 'verified' ? 'DISETUJUI' : 'DITOLAK'}</span>
    </article>)}</div>
  </section>;
}
