import { useCallback, useEffect, useState } from 'react';
import {
  collection, getCountFromServer, getDocs, limit, orderBy, query, where
} from 'firebase/firestore';
import {
  Activity, ArrowUpRight, Bell, ChartNoAxesCombined, ChevronRight, CircleAlert,
  LayoutDashboard, RefreshCw, ShieldCheck, Store, Users, MessageSquareText
} from 'lucide-react';
import AdminPanel from './AdminPanel.jsx';
import './owner-control-center.css';

const METRICS = [
  { key: 'members', label: 'Profil anggota', icon: Users, source: 'publicProfiles' },
  { key: 'warungs', label: 'Warkop terdaftar', icon: Store, source: 'warungs' },
  { key: 'verifiedWarungs', label: 'Warkop terverifikasi', icon: ShieldCheck, source: 'warungs' },
  { key: 'posts', label: 'Postingan publik', icon: MessageSquareText, source: 'posts' },
  { key: 'reports', label: 'Laporan masuk', icon: CircleAlert, source: 'postReports' },
];

function formatCount(value) {
  return typeof value === 'number'
    ? new Intl.NumberFormat('id-ID').format(value)
    : '—';
}

function formatActivityDate(value) {
  const date = value?.toDate?.() || (value instanceof Date ? value : null);
  if (!date) return 'Waktu tidak tersedia';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function ActivityRow({ item }) {
  const Icon = item.kind === 'warung' ? Store : Activity;
  return <article className="owner-activity-row">
    <span className="owner-activity-icon"><Icon size={17}/></span>
    <div className="owner-activity-copy">
      <b>{item.title}</b>
      <p>{item.description}</p>
      <small>{formatActivityDate(item.createdAt)}</small>
    </div>
    <span className="owner-activity-kind">{item.kind === 'warung' ? 'Warkop' : 'Posting'}</span>
  </article>;
}

export default function OwnerControlCenter({ db, user, onNotice }) {
  const [section, setSection] = useState('dashboard');
  const [metrics, setMetrics] = useState({});
  const [metricErrors, setMetricErrors] = useState({});
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (!db) {
      setLoadError('Firebase belum dikonfigurasi. Data dashboard tidak dapat dibaca.');
      setLoading(false);
      return;
    }
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError('');

    const countTasks = [
      ['members', query(collection(db, 'publicProfiles'))],
      ['warungs', query(collection(db, 'warungs'))],
      ['verifiedWarungs', query(collection(db, 'warungs'), where('verificationStatus', '==', 'verified'))],
      ['posts', query(collection(db, 'posts'))],
      ['reports', query(collection(db, 'postReports'))],
    ];
    const countResults = await Promise.all(countTasks.map(async ([key, targetQuery]) => {
      try {
        const result = await getCountFromServer(targetQuery);
        return [key, result.data().count, null];
      } catch (error) {
        return [key, null, error?.code || 'read-error'];
      }
    }));
    const nextMetrics = {};
    const nextErrors = {};
    countResults.forEach(([key, value, error]) => {
      nextMetrics[key] = value;
      if (error) nextErrors[key] = error;
    });
    setMetrics(nextMetrics);
    setMetricErrors(nextErrors);

    try {
      const [postsSnapshot, warungsSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(5))),
        getDocs(query(collection(db, 'warungs'), orderBy('createdAt', 'desc'), limit(5))),
      ]);
      const recentPosts = postsSnapshot.docs.map((entry) => {
        const data = entry.data();
        return {
          id: entry.id,
          kind: 'post',
          title: String(data.authorName || data.title || 'Postingan baru'),
          description: String(data.body || data.topic || 'Konten baru diterbitkan').slice(0, 120),
          createdAt: data.createdAt,
        };
      });
      const recentWarungs = warungsSnapshot.docs.map((entry) => {
        const data = entry.data();
        return {
          id: entry.id,
          kind: 'warung',
          title: String(data.name || 'Warkop baru'),
          description: String(data.address || data.villageName || 'Pendaftaran direktori warkop'),
          createdAt: data.createdAt,
        };
      });
      setActivity([...recentPosts, ...recentWarungs]
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
        .slice(0, 8));
    } catch (error) {
      setActivity([]);
      setLoadError(error?.code === 'permission-denied'
        ? 'Sebagian aktivitas terbaru tidak dapat dibaca oleh akun ini.'
        : 'Aktivitas terbaru gagal dimuat. Coba segarkan kembali.');
    }
    setLoading(false);
    setRefreshing(false);
  }, [db]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard utama', icon: LayoutDashboard },
    { id: 'operations', label: 'Verifikasi & laporan', icon: ShieldCheck },
  ];

  return <section className="owner-center" aria-label="Owner Control Center">
    <aside className="owner-center-sidebar">
      <div className="owner-center-brand">
        <span className="owner-center-mark"><ShieldCheck size={20}/></span>
        <span><b>WARKOPLINK</b><small>OWNER CONTROL CENTER</small></span>
      </div>
      <div className="owner-center-owner">
        <span className="owner-owner-avatar">{String(user?.displayName || user?.email || 'O').slice(0, 1).toUpperCase()}</span>
        <span><b>Pemilik Platform</b><small>{user?.displayName || user?.email || 'Akun pemilik'}</small></span>
      </div>
      <p className="owner-center-nav-label">PUSAT KENDALI</p>
      <nav className="owner-center-nav" aria-label="Navigasi pusat kendali">
        {navItems.map(({ id, label, icon: Icon }) => <button
          key={id}
          type="button"
          className={section === id ? 'is-active' : ''}
          aria-current={section === id ? 'page' : undefined}
          onClick={() => setSection(id)}
        ><Icon size={18}/><span>{label}</span><ChevronRight size={15}/></button>)}
      </nav>
      <div className="owner-center-sidebar-foot"><span className="owner-live-dot"/> Terhubung ke data platform</div>
    </aside>

    <div className="owner-center-main">
      <header className="owner-center-header">
        <div>
          <span className="owner-center-eyebrow">PUSAT PENGELOLAAN PLATFORM</span>
          <h1>{section === 'dashboard' ? 'Dashboard Utama' : 'Verifikasi & Laporan'}</h1>
          <p>Pantau ekosistem WarkopLink dari satu pusat kendali.</p>
        </div>
        {section === 'dashboard' && <button type="button" className="owner-refresh-button" onClick={() => loadDashboard(true)} disabled={refreshing}>
          <RefreshCw size={16} className={refreshing ? 'is-spinning' : ''}/>{refreshing ? 'Memuat…' : 'Segarkan data'}
        </button>}
      </header>

      {section === 'dashboard' ? <>
        <div className="owner-welcome-strip">
          <div><span>OVERVIEW PLATFORM</span><b>Selamat datang di pusat kendali WarkopLink</b><p>Angka di bawah diambil langsung dari koleksi Firestore yang dapat diakses akun pemilik.</p></div>
          <ChartNoAxesCombined size={34}/>
        </div>

        <div className="owner-metric-grid" aria-label="Statistik platform">
          {METRICS.map(({ key, label, icon: Icon }) => <article className="owner-metric-card" key={key}>
            <span className="owner-metric-icon"><Icon size={18}/></span>
            <span className="owner-metric-label">{label}</span>
            <strong aria-live="polite">{loading ? '…' : metricErrors[key] ? 'Tidak tersedia' : formatCount(metrics[key])}</strong>
            <small>{metricErrors[key] ? 'Akses data belum tersedia' : 'Data Firestore'}</small>
          </article>)}
        </div>

        {loadError && <div className="owner-inline-warning" role="status"><CircleAlert size={17}/><span>{loadError}</span></div>}

        <div className="owner-dashboard-columns">
          <section className="owner-panel-card">
            <div className="owner-panel-heading"><div><span>AKTIVITAS PLATFORM</span><h2>Aktivitas terbaru</h2></div><Activity size={19}/></div>
            {loading ? <p className="owner-muted-state">Mengambil aktivitas terbaru…</p> :
              activity.length ? <div className="owner-activity-list">{activity.map((item) => <ActivityRow item={item} key={item.kind + item.id}/>)}</div> :
                <div className="owner-empty-state">Belum ada aktivitas yang dapat ditampilkan.</div>}
          </section>
          <section className="owner-panel-card owner-quick-actions">
            <div className="owner-panel-heading"><div><span>AKSI CEPAT</span><h2>Pengelolaan inti</h2></div><ArrowUpRight size={19}/></div>
            <button type="button" onClick={() => setSection('operations')}><span className="owner-quick-icon"><Store size={18}/></span><span><b>Verifikasi warkop</b><small>Periksa pendaftaran dan keputusan</small></span><ChevronRight size={16}/></button>
            <button type="button" onClick={() => setSection('operations')}><span className="owner-quick-icon"><CircleAlert size={18}/></span><span><b>Penanganan laporan</b><small>Tinjau laporan konten anggota</small></span><ChevronRight size={16}/></button>
            <div className="owner-privacy-note"><ShieldCheck size={16}/><span>Data pesan pribadi dan profil privat tidak dibuka dalam ringkasan ini.</span></div>
          </section>
        </div>
        <p className="owner-data-footnote">Statistik yang tidak dapat dibaca akan ditandai “Tidak tersedia”, bukan diganti angka perkiraan.</p>
      </> : <AdminPanel db={db} user={user} onNotice={onNotice} canVerifyWarungs={true}/>}
    </div>
  </section>;
}
