import { useState } from 'react';
import { ArrowUpRight, Coffee, Compass, MapPin, Search, SlidersHorizontal, Store, Clock3, Navigation, CalendarDays, Wifi, Laptop, Users, Tv, Sparkles, List, Map as MapIcon, X } from 'lucide-react';
import WarungDiscoveryMap from './WarungDiscoveryMap.jsx';
import { ACTIVITY_OPTIONS, isOpenNow } from './directoryFilters.js';

const MOODS = [
  { value: 'all', label: 'Semua', icon: Compass },
  { value: 'relax', label: 'Ngopi Santai', icon: Coffee, activity: 'ngopi-bareng' },
  { value: 'work', label: 'Kerja & Laptop', icon: Laptop, activity: 'kerja-laptop' },
  { value: 'hangout', label: 'Nongkrong', icon: Users, activity: 'komunitas' },
  { value: 'community', label: 'Komunitas', icon: Users, activity: 'komunitas' },
  { value: 'nobar', label: 'Nobar', icon: Tv, activity: 'nobar' },
  { value: 'nearby', label: 'Terdekat', icon: MapPin },
  { value: 'events', label: 'Ada Event', icon: CalendarDays },
  { value: 'specialties', label: 'Menu Spesial', icon: Sparkles },
];

function photoFor(warung) {
  if (!Array.isArray(warung?.photos)) return '';
  return warung.photos.find((photo) => typeof photo === 'string' && photo.trim()) || '';
}

function locationLabel(warung) {
  return [warung?.villageName, warung?.districtName, warung?.regencyName, warung?.provinceName]
    .filter(Boolean).join(', ');
}

export default function WarungDiscoveryPage({
  location, category, onCategoryChange, searchTerm, onSearchChange,
  facilityOptions, activityOptions, facilityFilter, activityFilter,
  onToggleFacility, onToggleActivity, operationalFilter, onOperationalChange,
  sort, onSortChange, hasLocation, hasActiveFilter, onResetFilters, status, searchingAll, visibleWarungs,
  locationScopedWarungs, locationStatus, effectiveVisitorLocation,
  eventsStatus, discoveryEvents, popularStatus, followerCounts, distances,
  eventByWarung, now, mapViewOpen, onToggleMap, onOpenWarung,
  hasMore, loadingMore, onLoadMore, moreError, onRegister, onRetry,
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const heroWarung = visibleWarungs.find((item) => photoFor(item)) || locationScopedWarungs.find((item) => photoFor(item));
  const heroPhoto = photoFor(heroWarung);
  const featured = visibleWarungs.slice(0, 3);
  const countLabel = location?.mode && location.mode !== 'all'
    ? (location.label || location.query || 'Wilayah pilihan')
    : 'Seluruh Indonesia';

  const selectMood = (mood) => {
    if (['all', 'specialties', 'events', 'nearby'].includes(mood.value)) onCategoryChange(mood.value);
    else {
      onCategoryChange('all');
      if (mood.activity) onToggleActivity(mood.activity);
    }
  };

  return <main className="wl-discovery-page">
    <section className="wl-discovery-hero" style={heroPhoto ? { backgroundImage: `linear-gradient(90deg, rgba(25,18,14,.88), rgba(25,18,14,.34)), url("${heroPhoto}")` } : undefined}>
      <div className="wl-discovery-hero-grain" aria-hidden="true" />
      <div className="wl-discovery-hero-content">
        <span className="wl-discovery-eyebrow"><Coffee size={14}/> WARKOPLINK · COFFEE DISCOVERY</span>
        <h1>Temukan tempat singgah<span>.</span></h1>
        <p>Ruang untuk menikmati kopi, menemukan suasana, dan mengenal tempat lokal di seluruh Indonesia.</p>
        <label className="wl-discovery-search">
          <Search size={19} aria-hidden="true"/>
          <input value={searchTerm} onChange={(event) => onSearchChange(event.target.value)} placeholder="Cari warkop, menu, suasana, atau lokasi…" aria-label="Cari warkop"/>
          <span className="wl-discovery-search-hint">Cari</span>
        </label>
        <div className="wl-discovery-region"><MapPin size={15}/><span>Menjelajah: <strong>{countLabel}</strong></span></div>
      </div>
      <div className="wl-discovery-hero-index"><span>01</span><i/> DISCOVER LOCAL COFFEE CULTURE</div>
    </section>

    <section className="wl-discovery-section wl-discovery-moods">
      <div className="wl-discovery-section-heading">
        <div><span className="wl-discovery-kicker">MULAI DARI SUASANA</span><h2>Hari ini ingin ke mana?</h2></div>
        <span className="wl-discovery-muted">Pilih pengalaman</span>
      </div>
      <div className="wl-discovery-mood-rail" role="group" aria-label="Jelajahi berdasarkan suasana">
        {MOODS.map((mood) => {
          const Icon = mood.icon;
          const active = mood.value === category || (mood.activity && activityFilter.includes(mood.activity));
          return <button type="button" key={mood.value} className={active ? 'wl-discovery-mood active' : 'wl-discovery-mood'} aria-pressed={Boolean(active)} onClick={() => selectMood(mood)}>
            <span className="wl-discovery-mood-icon"><Icon size={18}/></span><span>{mood.label}</span>
          </button>;
        })}
      </div>
    </section>

    {featured.length > 0 && <section className="wl-discovery-section wl-discovery-featured">
      <div className="wl-discovery-section-heading">
        <div><span className="wl-discovery-kicker">DARI DIREKTORI WARKOP</span><h2>Kenali tempat lokal.</h2></div>
        <span className="wl-discovery-muted">Dari warkop terverifikasi</span>
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
        <div><span className="wl-discovery-kicker">DISCOVER MORE</span><h2>Jelajahi warkop.</h2><p>Tempat terverifikasi dengan informasi yang tersedia.</p></div>
        <div className="wl-discovery-result-actions"><button type="button" className="wl-discovery-filter-toggle" onClick={() => setFiltersOpen(true)} aria-expanded={filtersOpen}><SlidersHorizontal size={16}/> Filter</button><button type="button" className="wl-discovery-view-toggle" onClick={onToggleMap} aria-pressed={mapViewOpen}>{mapViewOpen ? <><List size={16}/> Daftar</> : <><MapIcon size={16}/> Peta</>}</button></div>
      </div>
      {filtersOpen && <button type="button" className="wl-discovery-filter-backdrop" aria-label="Tutup filter" onClick={() => setFiltersOpen(false)}/>}
      {filtersOpen && <div className="wl-discovery-filter-panel" role="dialog" aria-modal="true" aria-label="Filter warkop">
        <div className="wl-discovery-filter-panel-head"><div><span className="wl-discovery-kicker">REFINE YOUR DISCOVERY</span><strong>Filter pencarian</strong></div><button type="button" aria-label="Tutup filter" onClick={() => setFiltersOpen(false)}><X size={18}/></button></div>
        <div className="wl-discovery-filter-bar">
          <label><SlidersHorizontal size={16}/><select aria-label="Filter operasional" value={operationalFilter} onChange={(event) => onOperationalChange(event.target.value)}><option value="semua">Semua status</option><option value="buka-sekarang">Buka sekarang</option><option value="buka-24-jam">Buka 24 jam</option></select></label>
          <label className="wl-discovery-sort"><span>Urutkan</span><select aria-label="Urutkan warkop" value={sort} onChange={(event) => onSortChange(event.target.value)}><option value="relevance">Rekomendasi</option><option value="name">Nama A–Z</option><option value="distance" disabled={!hasLocation}>Terdekat</option></select></label>
          {hasActiveFilter && <button type="button" onClick={onResetFilters}>Reset filter</button>}
        </div>
        {(activityOptions.length > 0 || facilityOptions.length > 0) && <div className="wl-discovery-filter-chips">
          {activityOptions.map((item) => <button type="button" key={item.key} className={activityFilter.includes(item.key) ? 'active' : ''} aria-pressed={activityFilter.includes(item.key)} onClick={() => onToggleActivity(item.key)}>{item.label}</button>)}
          {facilityOptions.map((item) => <button type="button" key={item.key} className={facilityFilter.includes(item.key) ? 'active' : ''} aria-pressed={facilityFilter.includes(item.key)} onClick={() => onToggleFacility(item.key)}>{item.label}</button>)}
        </div>}
        <button type="button" className="wl-discovery-filter-done" onClick={() => setFiltersOpen(false)}>Terapkan filter</button>
      </div>}

      {status === 'loading' && <div className="wl-discovery-state"><h3>Menyiapkan tempat untuk dijelajahi…</h3><p>Mohon tunggu sebentar.</p></div>}
      {status === 'error' && <div className="wl-discovery-state"><h3>Direktori belum tersedia</h3><p>Periksa koneksi lalu coba lagi.</p><button type="button" onClick={onRetry}>Coba lagi</button></div>}
      {searchingAll && <p className="wl-discovery-status" role="status">Menelusuri halaman berikutnya…</p>}
      {category === 'nearby' && locationStatus === 'loading' && <p className="wl-discovery-status" role="status">Mencari tempat di sekitar lokasi perangkat…</p>}
      {category === 'nearby' && !effectiveVisitorLocation && locationStatus !== 'loading' && <p className="wl-discovery-status">Lokasi GPS belum tersedia. Anda tetap dapat menjelajah berdasarkan wilayah.</p>}
      {category === 'events' && eventsStatus === 'loading' && <p className="wl-discovery-status">Memuat acara warkop…</p>}
      {category === 'events' && eventsStatus === 'ready' && discoveryEvents.length === 0 && <p className="wl-discovery-status">Belum ada acara aktif atau mendatang yang terhubung ke warkop terverifikasi.</p>}
      {category === 'popular' && popularStatus === 'loading' && <p className="wl-discovery-status">Memuat data popularitas…</p>}
      {status === 'ready' && visibleWarungs.length === 0 && !searchingAll && <div className="wl-discovery-state"><span><Coffee size={22}/></span><h3>Belum ada tempat yang cocok.</h3><p>Coba suasana, kata kunci, atau filter yang berbeda.</p></div>}
      {status === 'ready' && <p className="wl-discovery-count" aria-live="polite">{visibleWarungs.length} dari {locationScopedWarungs.length} tempat yang sudah dimuat{hasMore ? ' · masih ada halaman berikutnya' : ''}</p>}
      {mapViewOpen ? <WarungDiscoveryMap warungs={visibleWarungs} onOpenWarung={onOpenWarung}/> : <div className="wl-discovery-card-grid">
        {visibleWarungs.map((warung) => {
          const photo = photoFor(warung);
          const open = isOpenNow(warung, now);
          const event = eventByWarung.get(warung.id);
          const highlights = [...(warung.specialties || []), ...(warung.activities || []).map((value) => ACTIVITY_OPTIONS.find((item) => item.value === value)?.label || value), ...(warung.facilities || [])].filter(Boolean).slice(0, 3);
          return <article className="wl-discovery-place-card" key={warung.id}>
            <button type="button" className="wl-discovery-place-media" onClick={() => onOpenWarung?.(warung.id)} aria-label={`Lihat ${warung.name}`}>
              {photo ? <img src={photo} alt={`Foto utama ${warung.name}`} loading="lazy" decoding="async"/> : <span className="wl-discovery-no-photo" role="img" aria-label={`Foto warkop belum tersedia untuk ${warung.name}`}><Store size={28}/></span>}
              {warung.openingHours?.is24Hours === true ? <span className="wl-discovery-open">Buka 24 jam</span> : open === true ? <span className="wl-discovery-open">Buka sekarang</span> : null}
            </button>
            <div className="wl-discovery-place-body">
              <div className="wl-discovery-place-top"><div><h3>{warung.name}</h3><p><MapPin size={13}/>{locationLabel(warung) || warung.address || 'Lokasi belum dilengkapi'}</p></div><ArrowUpRight size={17}/></div>
              {highlights.length > 0 && <div className="wl-discovery-highlights">{highlights.map((value, index) => <span key={`${value}-${index}`}>{value}</span>)}</div>}
              {warung.openingHours?.is24Hours === true ? <small className="wl-discovery-distance"><Clock3 size={12}/> Buka 24 jam</small> : warung.openingHours?.keterangan && !warung.openingHours?.schedule ? <small className="wl-discovery-distance"><Clock3 size={12}/> Jam buka: {warung.openingHours.keterangan}</small> : null}
              {Number.isFinite(distances[warung.id]) && <small className="wl-discovery-distance"><Navigation size={12}/> ±{distances[warung.id] < 10 ? distances[warung.id].toFixed(1) : Math.round(distances[warung.id])} km · garis lurus</small>}
              {event && <small className="wl-discovery-event"><CalendarDays size={12}/>{new Date(event.eventStartAt || event.eventDate).getTime() <= now.getTime() && event.eventEndAt && new Date(event.eventEndAt).getTime() >= now.getTime() ? 'SEDANG BERLANGSUNG · ' : 'AKAN DATANG · '}{event.eventKind || 'Acara warkop'} · {event.body?.split('\n')[0] || 'Lihat detail acara'}</small>}
              {category === 'popular' && Number.isFinite(followerCounts[warung.id]) && <small className="wl-discovery-distance">{followerCounts[warung.id]} pengikut</small>}
              <button type="button" className="wl-discovery-detail-link" onClick={() => onOpenWarung?.(warung.id)} aria-label={`Lihat detail ${warung.name}`}>Lihat detail <ArrowUpRight size={14}/></button>
            </div>
          </article>;
        })}
      </div>}
      {moreError && <p className="wl-discovery-status" role="alert">{moreError}</p>}
      {hasMore && <button type="button" className="wl-discovery-load-more" onClick={onLoadMore} disabled={loadingMore || searchingAll}>{loadingMore ? 'Memuat…' : 'Muat 30 tempat lagi'}</button>}
    </section>

    <section className="wl-discovery-owner-cta"><div><span className="wl-discovery-kicker">PUNYA TEMPAT NGOPI?</span><h2>Jadikan warkop Anda bagian dari cerita.</h2><p>Daftarkan tempat Anda agar bisa ditemukan penikmat kopi di seluruh Indonesia.</p></div><button type="button" onClick={onRegister}>Ajukan Warkop <ArrowUpRight size={16}/></button></section>
  </main>;
}
