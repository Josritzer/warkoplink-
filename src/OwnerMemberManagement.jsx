import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection, getDocs, limit, orderBy, query, startAfter
} from 'firebase/firestore';
import { MapPin, Search, Users, RefreshCw, ChevronDown } from 'lucide-react';

const PAGE_SIZE = 25;

function formatMemberDate(value) {
  const date = value?.toDate?.() || (value instanceof Date ? value : null);
  if (!date) return 'Tanggal pembaruan tidak tersedia';
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function initials(name) {
  return String(name || 'A').trim().slice(0, 1).toUpperCase();
}

export default function OwnerMemberManagement({ db }) {
  const [members, setMembers] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');

  const loadMembers = useCallback(async (reset = false) => {
    if (!db || loadingMore || (loading && !reset)) return;
    if (reset) setLoading(true);
    else setLoadingMore(true);
    setError('');
    try {
      const constraints = [orderBy('updatedAt', 'desc')];
      if (!reset && cursor) constraints.push(startAfter(cursor));
      constraints.push(limit(PAGE_SIZE));
      const snapshot = await getDocs(query(collection(db, 'publicProfiles'), ...constraints));
      const rows = snapshot.docs.map((entry) => ({ uid: entry.id, ...entry.data() }));
      setMembers((current) => reset ? rows : [...current, ...rows]);
      setCursor(snapshot.docs.at(-1) || (reset ? null : cursor));
      setHasMore(snapshot.docs.length === PAGE_SIZE);
    } catch (loadError) {
      setError(loadError?.code === 'permission-denied'
        ? 'Akses daftar profil publik ditolak oleh aturan Firestore.'
        : 'Daftar anggota belum dapat dimuat. Coba segarkan kembali.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [db, cursor, loading, loadingMore]);

  useEffect(() => {
    loadMembers(true);
  // Initial load is intentionally tied to the active Firestore instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  const filteredMembers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('id-ID');
    if (!term) return members;
    return members.filter((member) => [
      member.displayName, member.username, member.location, member.bio
    ].some((value) => String(value || '').toLocaleLowerCase('id-ID').includes(term)));
  }, [members, search]);

  return <section className="owner-members" aria-label="Pengelolaan anggota">
    <div className="owner-members-toolbar">
      <div className="owner-members-summary">
        <span className="owner-members-icon"><Users size={19}/></span>
        <div><b>{members.length.toLocaleString('id-ID')} anggota dimuat</b><small>Data profil publik · tanpa email atau informasi autentikasi</small></div>
      </div>
      <button type="button" className="owner-refresh-button" onClick={() => { setCursor(null); loadMembers(true); }} disabled={loading || loadingMore}>
        <RefreshCw size={15}/>{loading ? 'Memuat…' : 'Segarkan'}
      </button>
    </div>

    <label className="owner-members-search">
      <Search size={17}/>
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, username, atau lokasi anggota" aria-label="Cari anggota"/>
    </label>

    {error && <div className="owner-inline-warning" role="alert">{error}</div>}
    {loading && members.length === 0 && <p className="owner-muted-state" role="status">Memuat daftar anggota…</p>}
    {!loading && !error && members.length === 0 && <div className="owner-empty-state">Belum ada profil anggota yang dapat ditampilkan.</div>}
    {!loading && members.length > 0 && filteredMembers.length === 0 && <div className="owner-empty-state">Tidak ada anggota yang cocok pada data yang sudah dimuat.</div>}

    <div className="owner-member-list">
      {filteredMembers.map((member) => <article className="owner-member-row" key={member.uid}>
        <span className="owner-member-avatar">{member.photoURL ? <img src={member.photoURL} alt=""/> : initials(member.displayName)}</span>
        <div className="owner-member-copy">
          <b>{member.displayName || 'Anggota WarkopLink'}</b>
          <span>{member.username ? '@' + member.username : 'Username belum diatur'}</span>
          {member.bio && <p>{member.bio}</p>}
          <small>{member.location && <><MapPin size={12}/> {member.location} <span>·</span> </>}{formatMemberDate(member.updatedAt)}</small>
        </div>
        <span className="owner-member-status">Profil publik</span>
      </article>)}
    </div>

    {hasMore && <button type="button" className="owner-load-more" onClick={() => loadMembers(false)} disabled={loadingMore}>
      <ChevronDown size={16}/>{loadingMore ? 'Memuat anggota…' : 'Muat anggota berikutnya'}
    </button>}
    <p className="owner-data-footnote">Pencarian mencakup anggota yang sudah dimuat. Muat halaman berikutnya untuk memperluas hasil. Tindakan suspend dan hapus akun belum diaktifkan karena membutuhkan backend tepercaya.</p>
  </section>;
}
