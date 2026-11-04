import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection, getDocs, limit, orderBy, query, startAfter, where
} from 'firebase/firestore';
import { MapPin, RefreshCw, Search, Store, ChevronDown, X, History, ShieldCheck } from 'lucide-react';

const PAGE_SIZE = 25;
const STATUS_LABELS = {
  pending: 'Menunggu verifikasi',
  verified: 'Terverifikasi',
  rejected: 'Ditolak',
};
const STATUS_OPTIONS = [
  { value: 'all', label: 'Semua status' },
  { value: 'pending', label: 'Menunggu' },
  { value: 'verified', label: 'Terverifikasi' },
  { value: 'rejected', label: 'Ditolak' },
];

function formatDate(value) {
  const date = value?.toDate?.() || (value instanceof Date ? value : null);
  if (!date) return 'Waktu tidak tersedia';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function StatusPill({ status }) {
  return <span className={`owner-warung-status is-${status || 'unknown'}`}>{STATUS_LABELS[status] || 'Status tidak diketahui'}</span>;
}

function DetailRow({ label, children }) {
  if (children === undefined || children === null || children === '') return null;
  return <div className="owner-warung-detail-row"><span>{label}</span><b>{children}</b></div>;
}

export default function OwnerWarungManagement({ db }) {
  const [warungs, setWarungs] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [auditError, setAuditError] = useState('');

  const loadPage = useCallback(async (after = null, append = false) => {
    if (!db) {
      setError('Firebase belum dikonfigurasi.');
      setLoading(false);
      return;
    }
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      const constraints = statusFilter === 'all'
        ? [orderBy('createdAt', 'desc')]
        : [where('verificationStatus', '==', statusFilter), orderBy('nameNormalized', 'asc')];
      if (after) constraints.push(startAfter(after));
      constraints.push(limit(PAGE_SIZE));
      const snapshot = await getDocs(query(collection(db, 'warungs'), ...constraints));
      const rows = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      setWarungs((current) => append ? [...current, ...rows] : rows);
      setCursor(snapshot.docs.at(-1) || null);
      setHasMore(snapshot.docs.length === PAGE_SIZE);
    } catch (loadError) {
      setError(loadError?.code === 'permission-denied'
        ? 'Akses direktori ditolak oleh Firestore Rules.'
        : 'Data direktori belum dapat dimuat. Periksa koneksi lalu coba lagi.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [db, statusFilter]);

  useEffect(() => {
    setWarungs([]);
    setCursor(null);
    setSelected(null);
    loadPage(null, false);
  }, [loadPage]);

  useEffect(() => {
    if (!selected || !db) {
      setAudit([]);
      return undefined;
    }
    let active = true;
    setAuditError('');
    getDocs(query(collection(db, 'verificationAudit'), where('warungId', '==', selected.id), limit(20)))
      .then((snapshot) => {
        if (!active) return;
        setAudit(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
      })
      .catch(() => { if (active) setAuditError('Riwayat verifikasi belum dapat dimuat.'); });
    return () => { active = false; };
  }, [db, selected]);

  const visibleWarungs = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('id-ID');
    if (!term) return warungs;
    return warungs.filter((item) => [
      item.name, item.nameNormalized, item.address, item.villageName,
      item.districtName, item.regencyName, item.provinceName
    ].some((value) => String(value || '').toLocaleLowerCase('id-ID').includes(term)));
  }, [warungs, search]);

  return <section className="owner-warung-management" aria-label="Direktori warkop pemilik">
    <div className="owner-warung-toolbar">
      <div className="owner-warung-summary"><span className="owner-warung-summary-icon"><Store size={19}/></span><div><b>Direktori seluruh warkop</b><small>Data koleksi warungs · hanya dapat dilihat pemilik platform</small></div></div>
      <button type="button" className="owner-refresh-button" onClick={() => loadPage(null, false)} disabled={loading || loadingMore}><RefreshCw size={15}/>{loading ? 'Memuat…' : 'Segarkan'}</button>
    </div>

    <div className="owner-warung-controls">
      <label className="owner-warung-search"><Search size={17}/><input aria-label="Cari warkop" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, alamat, desa, atau kecamatan"/></label>
      <select aria-label="Filter status warkop" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
        {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>

    <div className="owner-warung-count">{visibleWarungs.length.toLocaleString('id-ID')} dari {warungs.length.toLocaleString('id-ID')} data pada halaman yang dimuat</div>
    {error && <div className="owner-inline-warning" role="alert">{error}</div>}
    {loading && warungs.length === 0 && <p className="owner-muted-state" role="status">Memuat direktori warkop…</p>}
    {!loading && !error && warungs.length === 0 && <div className="owner-empty-state">Belum ada data warkop untuk status ini.</div>}
    {!loading && warungs.length > 0 && visibleWarungs.length === 0 && <div className="owner-empty-state">Tidak ada warkop yang cocok pada data halaman ini.</div>}

    <div className="owner-warung-list">
      {visibleWarungs.map((warung) => <button type="button" className={`owner-warung-row ${selected?.id === warung.id ? 'is-selected' : ''}`} key={warung.id} onClick={() => setSelected(warung)} aria-pressed={selected?.id === warung.id}>
        <span className="owner-warung-avatar"><Store size={18}/></span>
        <span className="owner-warung-row-copy"><b>{warung.name || 'Warkop tanpa nama'}</b><small><MapPin size={12}/>{[warung.villageName, warung.districtName, warung.regencyName].filter(Boolean).join(', ') || warung.address || 'Lokasi belum diisi'}</small></span>
        <StatusPill status={warung.verificationStatus}/>
      </button>)}
    </div>

    {hasMore && <button type="button" className="owner-load-more" onClick={() => loadPage(cursor, true)} disabled={loadingMore}><ChevronDown size={16}/>{loadingMore ? 'Memuat…' : 'Muat 25 warkop berikutnya'}</button>}

    {selected && <section className="owner-warung-detail" aria-label="Detail warkop terpilih">
      <div className="owner-warung-detail-heading"><div><span>DETAIL DIREKTORI</span><h3>{selected.name || 'Warkop tanpa nama'}</h3></div><button type="button" aria-label="Tutup detail warkop" onClick={() => setSelected(null)}><X size={17}/></button></div>
      <StatusPill status={selected.verificationStatus}/>
      <div className="owner-warung-detail-grid">
        <DetailRow label="Alamat">{selected.address}</DetailRow>
        <DetailRow label="Wilayah">{[selected.villageName, selected.districtName, selected.regencyName, selected.provinceName].filter(Boolean).join(', ')}</DetailRow>
        <DetailRow label="Koordinat">{selected.coordinates ? `${selected.coordinates.lat}, ${selected.coordinates.lng}` : 'Belum tersedia'}</DetailRow>
        <DetailRow label="Fasilitas">{Array.isArray(selected.facilities) ? selected.facilities.join(', ') : ''}</DetailRow>
        <DetailRow label="Aktivitas">{Array.isArray(selected.activities) ? selected.activities.join(', ') : ''}</DetailRow>
        <DetailRow label="Menu spesial">{Array.isArray(selected.specialties) ? selected.specialties.join(', ') : ''}</DetailRow>
        <DetailRow label="Menu">{Array.isArray(selected.menuItems) ? selected.menuItems.join(', ') : ''}</DetailRow>
        <DetailRow label="Suasana">{selected.ambience}</DetailRow>
        <DetailRow label="Jam buka">{selected.openingHours?.keterangan || 'Belum diisi'}</DetailRow>
        <DetailRow label="Didaftarkan">{formatDate(selected.createdAt)}</DetailRow>
        <DetailRow label="Pembaruan terakhir">{formatDate(selected.updatedAt)}</DetailRow>
      </div>
      <div className="owner-warung-audit-heading"><History size={16}/><b>Riwayat verifikasi</b></div>
      {auditError && <p className="owner-inline-warning">{auditError}</p>}
      {!auditError && audit.length === 0 && <p className="owner-muted-state">Belum ada catatan verifikasi untuk warkop ini.</p>}
      {audit.map((entry) => <div className="owner-warung-audit-row" key={entry.id}><span><ShieldCheck size={14}/>{entry.newStatus === 'verified' ? 'Disetujui' : entry.newStatus === 'rejected' ? 'Ditolak' : 'Perubahan status'}</span><small>{formatDate(entry.createdAt)}</small>{entry.reason && <p>{entry.reason}</p>}</div>)}
    </section>}

    <p className="owner-data-footnote">Pencarian hanya mencakup halaman yang sudah dimuat. Modul ini bersifat baca-saja; keputusan verifikasi tetap dilakukan pada menu Verifikasi &amp; laporan.</p>
  </section>;
}
