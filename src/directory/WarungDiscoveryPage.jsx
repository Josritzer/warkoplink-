import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Coffee, Compass, Flame, MapPin, Search, SlidersHorizontal, Store, Clock3, Navigation, CalendarDays, Laptop, Users, Tv, Sparkles, List, Map as MapIcon, X } from 'lucide-react';
import WarungDiscoveryMap from './WarungDiscoveryMap.jsx';
import { collectSpecialtyMenuOptions } from './specialtyDiscovery.js';
import { groupActivityOptions } from './discoveryClassification.js';
import './specialtiesDiscovery.css';
import { ACTIVITY_OPTIONS, isOpenNow } from './directoryFilters.js';

const MOODS = [
  { value: 'all', label: 'Semua', icon: Compass },
  { value: 'popular', label: 'Populer', icon: Flame },
  { value: 'relax', label: 'Ngopi Bareng', icon: Coffee, activity: 'ngopi-bareng' },
  { value: 'work', label: 'Kerja & Laptop', icon: Laptop, activity: 'kerja-laptop' },
  { value: 'community', label: 'Komunitas', icon: Users, activity: 'komunitas' },
  { value: 'nobar', label: 'Nobar', icon: Tv, activity: 'nobar' },
  { value: 'nearby', label: 'Terdekat', icon: MapPin },
  { value: 'events', label: 'Ada Event', icon: CalendarDays },
  { value: 'specialties', label: 'Menu Spesial', icon: Sparkles },
];

const DIRECTORY_CATEGORIES = MOODS.filter((mood) => !mood.activity);
const QUICK_ACTIVITY_FILTERS = MOODS.filter((mood) => Boolean(mood.activity));

function photoFor(warung) {
  if (!Array.isArray(warung?.photos)) return '';
  return warung.photos.find((photo) => typeof photo === 'string' && photo.trim()) || '';
}

function locationLabel(warung) {
  return [warung?.villageName, warung?.districtName, warung?.regencyName, warung?.provinceName]
    .filter(Boolean).join(', ');
}

export default function WarungDiscoveryPage({
  location, category, onCategoryChange, searchTerm, onSearchChange, onSearchSubmit,
  facilityOptions, facilityFilter, activityFilter,
  onToggleFacility, onToggleActivity, operationalFilter, onOperationalChange,
  sort, onSortChange, hasLocation, hasActiveFilter, onResetFilters, status, visibleWarungs,
  locationScopedWarungs, locationStatus, effectiveVisitorLocation,
  eventsStatus, discoveryEvents, followerCountsStatus = 'idle', distances,
  eventByWarung, now, mapViewOpen, onToggleMap, onOpenWarung,
  hasMore, loadingMore, onLoadMore, moreError, onRegister, onRetry,
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const pageRef = useRef(null);
  const filterToggleRef = useRef(null);
  const filterPanelRef = useRef(null);
  const filterBackdropRef = useRef(null);
  const [mobileFilterDialog, setMobileFilterDialog] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia ? window.matchMedia('(max-width: 760px)').matches : window.innerWidth <= 760;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const media = window.matchMedia('(max-width: 760px)');
    const update = (event) => setMobileFilterDialog(event.matches);
    update(media);
    if (media.addEventListener) media.addEventListener('change', update);
    else media.addListener?.(update);
    return () => {
      if (media.removeEventListener) media.removeEventListener('change', update);
      else media.removeListener?.(update);
    };
  }, []);
  useEffect(() => {
    if (!filtersOpen || !filterPanelRef.current) return undefined;
    const panel = filterPanelRef.current;
    const backgroundStates = [];
    if (mobileFilterDialog) {
      for (const child of pageRef.current?.children || []) {
        if (child === panel || child === filterBackdropRef.current) continue;
        backgroundStates.push([child, child.inert]);
        child.inert = true;
      }
    }
    const getFocusable = () => [...panel.querySelectorAll('button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
    if (mobileFilterDialog) getFocusable()[0]?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setFiltersOpen(false);
        return;
      }
      if (!mobileFilterDialog || event.key !== 'Tab') return;
      const focusable = getFocusable();
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
        panel.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      backgroundStates.forEach(([element, wasInert]) => { element.inert = wasInert; });
      filterToggleRef.current?.focus();
    };
  }, [filtersOpen, mobileFilterDialog]);
  const heroWarung = visibleWarungs.find((item) => photoFor(item)) || locationScopedWarungs.find((item) => photoFor(item));
  const heroPhoto = photoFor(heroWarung);
  const featured = visibleWarungs.slice(0, 3);
  const specialtyMenuOptions = collectSpecialtyMenuOptions(locationScopedWarungs);
  const activityGroups = groupActivityOptions(ACTIVITY_OPTIONS.map(({ value, label }) => ({ key: value, label })));
  const countLabel = location?.mode && location.mode !== 'all'
    ? (location.label || location.query || 'Wilayah pilihan')
    : 'Seluruh Indonesia';

  // Terdekat hanya bermakna bila ada koordinat pengunjung yang valid; tanpa itu jangan tampilkan hasil, jumlah, atau muat-lebih-banyak.
  const nearbyUnavailable = category === 'nearby' && !effectiveVisitorLocation;
  const canRetryLocation = locationStatus === 'denied' || locationStatus === 'error';

  const selectMood = (mood) => {
    if (['all', 'popular', 'specialties', 'events', 'nearby'].includes(mood.value)) onCategoryChange(mood.value);
    else {
      onCategoryChange('all');
      if (mood.activity) onToggleActivity(mood.activity);
    }
  };

  return <main ref={pageRef} className="wl-discovery-page">
    <section className="wl-discovery-hero" style={heroPhoto ? { backgroundImage: `linear-gradient(90deg, rgba(25,18,14,.88), rgba(25,18,14,.34)), url("${heroPhoto}")` } : undefined}>
      <div className="wl-discovery-hero-grain" aria-hidden="true" />
      <div className="wl-discovery-hero-content">
        <span className="wl-discovery-eyebrow"><Coffee size={14}/> WARKOPLINK · COFFEE DISCOVERY</span>
        <h1>{category === 'specialties' ? <>Temukan menu <em>andalan.</em></> : <>Temukan tempat singgah<span>.</span></>}</h1>
        <p>{category === 'specialties' ? 'Racikan kopi dan hidangan pilihan dari warkop terverifikasi di wilayah Anda.' : 'Temukan kopi, suasana, dan cerita lokal—dari kota Anda hingga seluruh Indonesia.'}</p>
        <form className="wl-discovery-search" role="search" aria-label="Pencarian direktori warkop" onSubmit={(event) => { event.preventDefault(); onSearchSubmit?.(searchTerm); }}>
          <Search size={19} aria-hidden="true"/>
          <input type="search" value={searchTerm} onChange={(event) => onSearchChange(event.target.value)} placeholder={category === 'specialties' ? "Cari nama menu atau warkop…" : "Cari warkop, menu, suasana, atau lokasi…"} aria-label={category === 'specialties' ? "Cari menu spesial atau warkop" : "Cari warkop"}/>
          {searchTerm && <button type="button" className="wl-discovery-search-clear" aria-label="Hapus kata pencarian" onClick={() => { onSearchChange(''); onSearchSubmit?.(''); }}><X size={16}/></button>}
          <button type="submit" className="wl-discovery-search-submit">Cari</button>
        </form>
        <div className="wl-discovery-region" aria-label={`Wilayah penjelajahan: ${countLabel}`}><MapPin size={15}/><span>Menjelajah <strong>{countLabel}</strong></span></div>
      </div>
      <div className="wl-discovery-hero-index"><span>01</span><i/> KOPI LOKAL, CERITA DEKAT</div>
    </section>

    <div className="wl-discovery-result-actions wl-discovery-quick-actions" role="group" aria-label="Kontrol pencarian">
      <button ref={filterToggleRef} type="button" className="wl-discovery-filter-toggle" onClick={() => setFiltersOpen(true)} aria-expanded={filtersOpen} aria-controls="wl-discovery-filter-panel"><SlidersHorizontal size={16}/> Filter{hasActiveFilter && <i className="wl-discovery-filter-active-dot" aria-label="Filter aktif"/>}</button>
      <button type="button" className="wl-discovery-view-toggle" onClick={onToggleMap} aria-pressed={mapViewOpen}>{mapViewOpen ? <><List size={16}/> Daftar</> : <><MapIcon size={16}/> Peta</>}</button>
    </div>

    {filtersOpen && mobileFilterDialog && <div ref={filterBackdropRef} className="wl-discovery-filter-backdrop" aria-hidden="true" onClick={() => setFiltersOpen(false)}/>}
    {filtersOpen && <div ref={filterPanelRef} id="wl-discovery-filter-panel" className="wl-discovery-filter-panel" role="dialog" aria-modal={mobileFilterDialog ? 'true' : undefined} aria-labelledby="wl-discovery-filter-title">
      <div className="wl-discovery-filter-panel-head">
        <div><span className="wl-discovery-kicker">SESUAIKAN PENCARIAN</span><strong id="wl-discovery-filter-title">Atur preferensi Anda</strong><p>Temukan tempat berdasarkan kebutuhan dan suasana yang dicari.</p></div>
        <button type="button" aria-label="Tutup filter" onClick={() => setFiltersOpen(false)}><X size={18}/></button>
      </div>
      <section className="wl-discovery-filter-group wl-discovery-category-group">
        <div className="wl-discovery-filter-title"><h3>Jelajahi berdasarkan kebutuhan</h3><span>PILIH SATU KATEGORI</span></div>
        <div className="wl-discovery-category-grid">
          {DIRECTORY_CATEGORIES.map((mood) => {
            const Icon = mood.icon;
            const active = category === mood.value;
            return <button type="button" key={mood.value} className={active ? 'active' : ''} aria-pressed={active} onClick={() => onCategoryChange(mood.value)}>
              <Icon size={17}/><span>{mood.label}</span><small>{mood.value === 'all' ? 'Semua tempat' : mood.value === 'popular' ? 'Ada pengikut tercatat' : mood.value === 'nearby' ? 'Butuh izin lokasi' : mood.value === 'specialties' ? 'Menu unggulan pemilik' : 'Acara aktif atau mendatang'}</small>
            </button>;
          })}
        </div>
      </section>
      <div className="wl-discovery-filter-controls">
        <section className="wl-discovery-filter-group wl-discovery-operational-group">
          <div className="wl-discovery-filter-title"><h3>Waktu operasional</h3><span>STATUS</span></div>
          <div className="wl-discovery-select-control"><Clock3 size={16}/><select aria-label="Filter operasional" value={operationalFilter} onChange={(event) => onOperationalChange(event.target.value)}><option value="semua">Semua status</option><option value="buka-sekarang">Buka sekarang</option><option value="buka-24-jam">Buka 24 jam</option></select></div>
          <p className="wl-discovery-filter-help">“Buka sekarang” memerlukan jadwal mingguan lengkap; keterangan jam bebas belum dapat dipastikan. “Buka 24 jam” hanya untuk profil yang menandainya.</p>
        </section>
        <section className="wl-discovery-filter-group wl-discovery-sort-group">
          <div className="wl-discovery-filter-title"><h3>Urutan hasil</h3><span>URUTKAN</span></div>
          <div className="wl-discovery-select-control"><SlidersHorizontal size={16}/><select aria-label="Urutkan warkop" value={sort} onChange={(event) => onSortChange(event.target.value)}><option value="relevance">Paling relevan</option><option value="distance" disabled={!hasLocation}>Jarak terdekat</option></select></div>
        </section>
      </div>
      <section className="wl-discovery-filter-group wl-discovery-filter-classifications">
        <div className="wl-discovery-filter-title"><h3>Aktivitas & suasana</h3><span>PILIH SATU ATAU BEBERAPA</span></div>
        <p className="wl-discovery-filter-help">Jika memilih beberapa aktivitas, warkop yang cocok dengan salah satu pilihan akan ditampilkan.</p>
        {activityGroups.map((group) => <div className="wl-discovery-filter-subgroup" key={group.key}>
          <strong>{group.label}</strong><div className="wl-discovery-filter-chips">
            {group.options.map((item) => <button type="button" key={item.key} className={activityFilter.includes(item.key) ? 'active' : ''} aria-pressed={activityFilter.includes(item.key)} onClick={() => onToggleActivity(item.key)}>{item.label}</button>)}
          </div>
        </div>)}
      </section>
      <section className="wl-discovery-filter-group wl-discovery-facility-group">
        <div className="wl-discovery-filter-title"><h3>Fasilitas yang tersedia</h3><span>SEMUA PILIHAN WAJIB ADA</span></div>
        {facilityOptions.length > 0 ? <><p className="wl-discovery-filter-help">Semua fasilitas yang dipilih harus tersedia. Jumlah menunjukkan tempat yang sudah dimuat di wilayah ini.</p><div className="wl-discovery-filter-chips">{facilityOptions.map((item) => <button type="button" key={item.key} className={facilityFilter.includes(item.key) ? 'active' : ''} aria-pressed={facilityFilter.includes(item.key)} onClick={() => onToggleFacility(item.key)}>{item.label}<small>{item.count}</small></button>)}</div></> : <p className="wl-discovery-filter-empty" role="status">Belum ada fasilitas yang dicantumkan oleh warkop di wilayah ini. Pilihan fasilitas akan muncul setelah pemilik melengkapi profil warkop.</p>}
      </section>
      <div className="wl-discovery-filter-footer">
        {hasActiveFilter && <button type="button" className="wl-discovery-filter-reset" onClick={onResetFilters}>Reset semua filter</button>}
        <button type="button" className="wl-discovery-filter-done" onClick={() => setFiltersOpen(false)}>Tampilkan hasil pencarian</button>
      </div>
    </div>}

    <section className="wl-discovery-section wl-discovery-moods">
      <div className="wl-discovery-section-heading">
        <div><span className="wl-discovery-kicker">MULAI DARI KEBUTUHAN</span><h2>Mulai dari cara Anda ngopi.</h2></div>
      </div>
      <div className="wl-discovery-mood-group">
        <div className="wl-discovery-mood-group-label"><strong>Jelajahi direktori</strong><span>Pilih satu kategori</span></div>
        <div className="wl-discovery-mood-rail" role="group" aria-label="Kategori penjelajahan, pilih satu">
          {DIRECTORY_CATEGORIES.map((mood) => {
            const Icon = mood.icon;
            const active = mood.value === category;
            return <button type="button" key={mood.value} className={active ? 'wl-discovery-mood active' : 'wl-discovery-mood'} aria-pressed={active} onClick={() => selectMood(mood)}>
              <span className="wl-discovery-mood-icon"><Icon size={18}/></span><span>{mood.label}</span>
            </button>;
          })}
        </div>
      </div>
      <div className="wl-discovery-mood-group">
        <div className="wl-discovery-mood-group-label"><strong>Suasana & aktivitas</strong><span>Pilih satu atau beberapa</span></div>
        <div className="wl-discovery-mood-rail" role="group" aria-label="Filter aktivitas dan suasana, pilih satu atau beberapa">
          {QUICK_ACTIVITY_FILTERS.map((mood) => {
            const Icon = mood.icon;
            const active = activityFilter.includes(mood.activity);
            return <button type="button" key={mood.value} className={active ? 'wl-discovery-mood active' : 'wl-discovery-mood'} aria-pressed={active} onClick={() => selectMood(mood)}>
              <span className="wl-discovery-mood-icon"><Icon size={18}/></span><span>{mood.label}</span>
            </button>;
          })}
        </div>
      </div>
    </section>

    {featured.length > 0 && !mapViewOpen && category !== 'specialties' && <section className="wl-discovery-section wl-discovery-featured">
      <div className="wl-discovery-section-heading">
        <div><span className="wl-discovery-kicker">PILIHAN KAMI</span><h2>Singgah yang berkesan.</h2></div>
        <span className="wl-discovery-muted">Warkop terverifikasi</span>
      </div>
      <div className="wl-discovery-featured-grid">
        {featured.map((warung, index) => {
          const photo = photoFor(warung);
          return <button type="button" className={index === 0 ? 'wl-discovery-feature-card is-lead' : 'wl-discovery-feature-card'} key={warung.id} onClick={() => onOpenWarung?.(warung.id)}>
            {photo ? <img src={photo} alt={`Foto utama ${warung.name}`} loading="lazy" decoding="async"/> : <span className="wl-discovery-no-photo"><Store size={26}/></span>}
            <span className="wl-discovery-feature-shade"/>
            <span className="wl-discovery-feature-copy"><small>{index === 0 ? 'DIREKTORI WARKOP' : 'WARKOP TERVERIFIKASI'}</small><strong>{warung.name}</strong><span>{locationLabel(warung) || warung.address || 'Lokasi belum dilengkapi'}</span></span>
            <span className="wl-discovery-feature-arrow"><ArrowUpRight size={17}/></span>
          </button>;
        })}
      </div>
    </section>}

    <section className="wl-discovery-section wl-discovery-results">
      <div className="wl-discovery-section-heading">
        <div><span className="wl-discovery-kicker">{category === 'specialties' ? 'MENU PILIHAN PEMILIK' : 'TEMUKAN TEMPAT LOKAL'}</span><h2>{category === 'specialties' ? 'Menu andalan di sekitar Anda.' : 'Warkop pilihan untuk disinggahi.'}</h2><p>{category === 'specialties' ? 'Menu yang dicantumkan langsung oleh pemilik warkop.' : 'Tempat terverifikasi dengan informasi yang tersedia.'}</p></div>
      </div>
      {category === 'specialties' && <div className="wl-specialty-discovery-intro">
        <div className="wl-specialty-discovery-copy">
          <span className="wl-discovery-kicker">DARI MENU PEMILIK WARKOP</span>
          <strong>Rasa khas, cerita lokal.</strong>
          <span>Pilih menu untuk menemukan warkop yang menyediakannya.</span>
        </div>
        {specialtyMenuOptions.length > 0 && <div className="wl-specialty-menu-rail" aria-label="Pilihan menu yang tersedia">
          {specialtyMenuOptions.map((item) => <button type="button" key={item.name} onClick={() => onSearchChange(item.name)} aria-pressed={searchTerm.trim().toLowerCase() === item.name.toLowerCase()}>
            <span>{item.name}</span><small>{item.count} warkop</small>
          </button>)}
        </div>}
      </div>}
      {status === 'loading' && <div className="wl-discovery-state"><h3>Menyiapkan tempat untuk dijelajahi…</h3><p>Mohon tunggu sebentar.</p></div>}
      {status === 'error' && <div className="wl-discovery-state"><h3>Direktori belum tersedia</h3><p>Periksa koneksi lalu coba lagi.</p><button type="button" onClick={onRetry}>Coba lagi</button></div>}
      {category === 'nearby' && locationStatus === 'loading' && <p className="wl-discovery-status" role="status">Mencari tempat di sekitar lokasi perangkat…</p>}
      {nearbyUnavailable && locationStatus !== 'loading' && <div className="wl-discovery-state" role="status">
        <span><MapPin size={22}/></span>
        {locationStatus === 'unsupported'
          ? <><h3>Lokasi tidak tersedia di browser ini.</h3><p>Pilih wilayah secara manual lewat menu lokasi untuk menjelajahi warkop.</p></>
          : <><h3>Aktifkan lokasi untuk menemukan warkop terdekat.</h3><p>{locationStatus === 'denied'
            ? 'Izin lokasi ditolak. Izinkan akses lokasi di pengaturan browser, lalu coba lagi untuk melihat hasil berdasarkan jarak sebenarnya.'
            : 'Lokasi perangkat belum tersedia. Pastikan GPS aktif, lalu coba lagi untuk melihat hasil berdasarkan jarak sebenarnya.'}</p></>}
        {canRetryLocation && <button type="button" onClick={() => onCategoryChange('nearby')}>Coba lagi</button>}
      </div>}
      {category === 'popular' && followerCountsStatus === 'loading' && <p className="wl-discovery-status" role="status">Menghitung jumlah pengikut warkop…</p>}
      {category === 'popular' && followerCountsStatus === 'error' && <p className="wl-discovery-status" role="status">Sebagian data pengikut tidak dapat dimuat. Daftar populer mungkin belum lengkap.</p>}
      {category === 'events' && eventsStatus === 'loading' && <p className="wl-discovery-status">Memuat acara warkop…</p>}
      {category === 'events' && eventsStatus === 'ready' && discoveryEvents.length === 0 && <p className="wl-discovery-status">Belum ada acara aktif atau mendatang yang terhubung ke warkop terverifikasi.</p>}
      {status === 'ready' && visibleWarungs.length === 0 && !nearbyUnavailable && !(category === 'nearby' && locationStatus === 'loading') && !(category === 'popular' && followerCountsStatus === 'loading') && !(category === 'events' && eventsStatus === 'loading') && <div className="wl-discovery-state"><span><Coffee size={22}/></span><h3>{category === 'specialties' ? 'Menu spesial belum ditemukan.' : category === 'events' ? 'Belum ada acara warkop.' : 'Belum ada tempat yang cocok.'}</h3><p>{category === 'specialties'
        ? 'Coba nama menu lain atau hapus kata kunci pencarian.'
        : operationalFilter === 'buka-sekarang'
          ? 'Belum ada jadwal mingguan lengkap yang dapat dipastikan sedang buka. Coba Semua status atau lengkapi jadwal warkop.'
          : operationalFilter === 'buka-24-jam'
            ? 'Tidak ada profil yang menandai buka 24 jam. Coba Semua status atau Muat lebih banyak tempat.'
            : category === 'events' && eventsStatus === 'ready'
              ? 'Belum ada acara aktif atau mendatang yang terhubung ke warkop terverifikasi.'
              : hasMore
                ? `Belum cocok di ${locationScopedWarungs.length} tempat yang sudah dimuat. Muat 30 tempat lagi untuk memperluas pencarian, atau ubah kata kunci/filter.`
                : 'Coba suasana, kata kunci, atau filter yang berbeda.'}</p></div>}
      {status === 'ready' && !nearbyUnavailable && <p className="wl-discovery-count" aria-live="polite">{visibleWarungs.length} dari {locationScopedWarungs.length} tempat yang sudah dimuat{hasMore ? ' · masih ada halaman berikutnya' : ''}</p>}
      {mapViewOpen ? <WarungDiscoveryMap warungs={visibleWarungs} onOpenWarung={onOpenWarung}/> : <div className="wl-discovery-card-grid">
        {visibleWarungs.map((warung) => {
          const photo = photoFor(warung);
          const open = isOpenNow(warung, now);
          const event = eventByWarung.get(warung.id);
          const highlights = category === 'specialties' ? (warung.specialties || []).filter(Boolean).slice(0, 4) : [...(warung.specialties || []), ...(warung.activities || []).map((value) => ACTIVITY_OPTIONS.find((item) => item.value === value)?.label || value), ...(warung.facilities || [])].filter(Boolean).slice(0, 3);
          return <article className={category === 'specialties' ? "wl-discovery-place-card wl-specialty-place-card" : "wl-discovery-place-card"} key={warung.id}>
            <button type="button" className="wl-discovery-place-media" onClick={() => onOpenWarung?.(warung.id)} aria-label={`Lihat ${warung.name}`}>
              {photo ? <img src={photo} alt={`Foto utama ${warung.name}`} loading="lazy" decoding="async"/> : <span className="wl-discovery-no-photo" role="img" aria-label={`Foto warkop belum tersedia untuk ${warung.name}`}><Store size={28}/></span>}
              {warung.openingHours?.is24Hours === true ? <span className="wl-discovery-open">Buka 24 jam</span> : open === true ? <span className="wl-discovery-open">Buka sekarang</span> : null}
            </button>
            <div className="wl-discovery-place-body">
              <div className="wl-discovery-place-top"><div><h3>{warung.name}</h3><p><MapPin size={13}/>{locationLabel(warung) || warung.address || 'Lokasi belum dilengkapi'}</p></div><ArrowUpRight size={17}/></div>
              {highlights.length > 0 && <div className="wl-discovery-highlights">{highlights.map((value, index) => <span key={`${value}-${index}`}>{value}</span>)}</div>}
              {warung.openingHours?.keterangan && warung.openingHours?.is24Hours !== true && !warung.openingHours?.schedule ? <small className="wl-discovery-distance"><Clock3 size={12}/> Jam buka: {warung.openingHours.keterangan}</small> : null}
              {Number.isFinite(distances[warung.id]) && <small className="wl-discovery-distance"><Navigation size={12}/> ±{distances[warung.id] < 10 ? distances[warung.id].toFixed(1) : Math.round(distances[warung.id])} km · garis lurus</small>}
              {event && <small className="wl-discovery-event"><CalendarDays size={12}/>{new Date(event.eventStartAt || event.eventDate).getTime() <= now.getTime() && event.eventEndAt && new Date(event.eventEndAt).getTime() >= now.getTime() ? 'SEDANG BERLANGSUNG · ' : 'AKAN DATANG · '}{event.eventKind || 'Acara warkop'} · {event.body?.split('\n')[0] || 'Lihat detail acara'}</small>}
              <button type="button" className="wl-discovery-detail-link" onClick={() => onOpenWarung?.(warung.id)} aria-label={`Lihat detail ${warung.name}`}>Lihat detail <ArrowUpRight size={14}/></button>
            </div>
          </article>;
        })}
      </div>}
      {moreError && <p className="wl-discovery-status" role="alert">{moreError}</p>}
      {hasMore && !nearbyUnavailable && <button type="button" className="wl-discovery-load-more" onClick={onLoadMore} disabled={loadingMore}>{loadingMore ? 'Memuat…' : 'Muat 30 tempat lagi'}</button>}
    </section>

    <section className="wl-discovery-owner-cta"><div><span className="wl-discovery-kicker">PUNYA TEMPAT NGOPI?</span><h2>Jadikan warkop Anda bagian dari cerita.</h2><p>Daftarkan tempat Anda agar bisa ditemukan penikmat kopi di seluruh Indonesia.</p></div><button type="button" onClick={onRegister}>Ajukan Warkop <ArrowUpRight size={16}/></button></section>
  </main>;
}
