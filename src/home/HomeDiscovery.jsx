import { useMemo, useState } from 'react';
import { ArrowRight, ArrowUpRight, CalendarDays, Clock3, MapPin, Search, ShieldCheck, SlidersHorizontal, Store, Users, Utensils, Video } from 'lucide-react';
import { isOpenNow } from '../directory/directoryFilters.js';
import { buildHomeDiscoveryData, getHomeActivityStatus } from './homeDiscoveryModel.js';

const CATEGORIES = [
  { label: 'Warkop', icon: Store, target: 'home-warungs' },
  { label: 'Menu', icon: Utensils, target: 'home-warungs' },
  { label: 'Komunitas', icon: Users, target: 'home-community' },
  { label: 'Acara', icon: CalendarDays, target: 'home-events' }
];

function eventDateLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}

function searchableText(record) {
  return [
    record?.name, record?.address, record?.regencyName, record?.districtName,
    ...(Array.isArray(record?.specialties) ? record.specialties : []),
    ...(Array.isArray(record?.menuItems) ? record.menuItems : []),
    record?.body, record?.eventKind, record?.postType, record?.location
  ].filter(Boolean).join(' ').toLocaleLowerCase('id-ID');
}

function SectionHeading({ eyebrow, title, description, action, onAction }) {
  return <div className="home-discovery-heading">
    <div><span className="home-discovery-eyebrow">{eyebrow}</span><h2>{title}</h2>{description && <p>{description}</p>}</div>
    {action && <button className="home-discovery-link" type="button" onClick={onAction}>{action}<ArrowRight size={15}/></button>}
  </div>;
}

export default function HomeDiscovery({ warungs = [], posts = [], postsStatus = 'ready', onOpenWarung, onOpenPost, onOpenDirectory, onOpenCommunity }) {
  const [search, setSearch] = useState('');
  const [activityFilter, setActivityFilter] = useState('all');
  const data = useMemo(() => buildHomeDiscoveryData(warungs, posts), [warungs, posts]);
  const needle = search.trim().toLocaleLowerCase('id-ID');
  const visibleWarungs = useMemo(() => data.warungs.filter(item => !needle || searchableText(item).includes(needle)), [data.warungs, needle]);
  const visibleActivities = useMemo(() => data.activities.filter(item => {
    const status = getHomeActivityStatus(item);
    if (activityFilter === 'ongoing' && status !== 'ongoing') return false;
    if (activityFilter === 'today') {
      const start = new Date(item.eventStartAt || '');
      const now = new Date();
      if (!Number.isFinite(start.getTime()) || start.toDateString() !== now.toDateString()) return false;
    }
    if (activityFilter === 'scheduled' && status !== 'scheduled') return false;
    return !needle || searchableText(item).includes(needle);
  }), [data.activities, activityFilter, needle]);
  const visibleEvents = useMemo(() => data.events.filter(item => !needle || searchableText(item).includes(needle)), [data.events, needle]);
  const visibleReels = useMemo(() => data.reels.filter(item => !needle || searchableText(item).includes(needle)), [data.reels, needle]);

  function scrollTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return <div className="home-discovery" aria-label="Jelajahi WarkopLink">
    <section className="home-discovery-hero" aria-label="Pencarian WarkopLink">
      <div className="home-discovery-hero-copy">
        <span className="home-discovery-eyebrow">WARKOPLINK · LOCAL DISCOVERY</span>
        <h1 id="home-discovery-title">Temukan tempat singgah, <em>temukan cerita.</em></h1>
        <p>Jelajahi warkop, menu spesial, aktivitas, dan komunitas dari berbagai daerah di Indonesia.</p>
        <label className="home-discovery-search"><Search size={21}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari warkop, menu, atau kegiatan…" aria-label="Cari warkop, menu, atau kegiatan"/>{search && <button type="button" onClick={() => setSearch('')} aria-label="Hapus pencarian">×</button>}<button className="home-search-filter" type="button" onClick={onOpenDirectory} aria-label="Buka filter pencarian"><SlidersHorizontal size={21}/></button></label>
      </div>
    </section>

    <nav className="home-explore-categories" aria-label="Kategori penjelajahan">
      {CATEGORIES.map(({ label, icon: Icon, target }) => <button key={label} type="button" onClick={() => label === 'Komunitas' ? onOpenCommunity?.() : scrollTo(target)}><span><Icon size={20}/></span><b>{label}</b><small>{label === 'Warkop' ? 'Temukan tempat' : label === 'Menu' ? 'Menu spesial' : label === 'Komunitas' ? 'Cerita warga' : 'Agenda lokal'}</small></button>)}
    </nav>

    <section className="home-discovery-section" id="home-warungs">
      <SectionHeading eyebrow="TEMPAT PILIHAN" title="Warkop pilihan" action="Lihat Semua" onAction={onOpenDirectory}/>
      {visibleWarungs.length ? <div className="home-warung-grid">{visibleWarungs.slice(0, 8).map(warung => {
        const photo = Array.isArray(warung.photos) ? warung.photos.find(value => typeof value === 'string' && value.trim()) : '';
        const openState = isOpenNow(warung);
        const specialties = Array.isArray(warung.specialties) ? warung.specialties.filter(Boolean).slice(0, 2) : [];
        return <article className="home-warung-card" key={warung.id}>
          <button type="button" className="home-warung-media" onClick={() => onOpenWarung?.(warung.id)} aria-label={`Buka profil ${warung.name || 'warkop'}`}>
            {photo ? <img src={photo} alt={`Foto ${warung.name || 'warkop'}`} loading="lazy" decoding="async"/> : <span className="home-media-placeholder"><Store size={30}/><small>Foto belum tersedia</small></span>}
            <span className="home-warung-verified"><ShieldCheck size={12}/> Terverifikasi</span>
          </button>
          <div className="home-warung-copy"><div className="home-warung-title"><h3>{warung.name || 'Warkop lokal'}</h3>{openState === true ? <span className="home-open-state">Buka</span> : openState === false ? <span className="home-closed-state">Tutup</span> : null}</div>
            <p><MapPin size={13}/>{warung.address || [warung.villageName, warung.districtName, warung.regencyName].filter(Boolean).join(', ') || 'Lokasi belum tersedia'}</p>
            {specialties.length > 0 && <div className="home-specialties">{specialties.map(item => <span key={item}>{item}</span>)}</div>}
            <button className="home-card-action" type="button" onClick={() => onOpenWarung?.(warung.id)}>Lihat profil <ArrowUpRight size={14}/></button>
          </div>
        </article>;
      })}</div> : <div className="home-discovery-empty"><Store size={22}/><b>{needle ? 'Warkop tidak ditemukan' : 'Belum ada warkop untuk ditampilkan'}</b><span>{needle ? 'Coba kata kunci lain.' : 'Warkop terverifikasi akan muncul di sini.'}</span></div>}
    </section>

    <section className="home-discovery-section" id="home-activities">
      <SectionHeading eyebrow="AKTIVITAS KOMUNITAS" title="Sedang ramai" action="Lihat Semua" onAction={onOpenCommunity}/>
      <div className="home-activity-filters" role="group" aria-label="Filter aktivitas">
        {[['all','Semua'],['ongoing','Berlangsung'],['today','Hari ini'],['scheduled','Terjadwal']].map(([value,label]) => <button key={value} type="button" className={activityFilter === value ? 'active' : ''} aria-pressed={activityFilter === value} onClick={() => setActivityFilter(value)}>{label}</button>)}
      </div>
      {visibleActivities.length ? <div className="home-activity-list">{visibleActivities.slice(0, 5).map(post => {
        const status = getHomeActivityStatus(post);
        const linkedWarung = post.warungId ? warungs.find(item => item.id === post.warungId) : null;
        return <article className="home-activity-card" key={post.id}>
          <div className="home-activity-icon">{post.eventPhotoURL ? <img src={post.eventPhotoURL} alt="" loading="lazy"/> : <Users size={20}/>}</div>
          <div className="home-activity-copy"><div className="home-activity-meta"><span>{post.eventKind || post.postType || post.topic}</span>{status === 'ongoing' && <b className="home-live-label">Berlangsung</b>}{status === 'scheduled' && <b className="home-scheduled-label">Terjadwal</b>}</div><h3>{post.body?.split('\n')[0]?.slice(0, 92) || 'Aktivitas komunitas'}</h3>
            <div className="home-activity-details">{post.eventStartAt && <span><Clock3 size={13}/>{eventDateLabel(post.eventStartAt)}</span>}{post.location && <span><MapPin size={13}/>{post.location}</span>}</div>
            {linkedWarung && <button type="button" className="home-activity-organizer" onClick={() => onOpenWarung?.(linkedWarung.id)}><Store size={13}/>{linkedWarung.name}</button>}
          </div>
          <button type="button" className="home-activity-open" onClick={() => onOpenPost?.(post)} aria-label="Buka detail aktivitas"><ArrowUpRight size={18}/></button>
        </article>;
      })}</div> : <div className="home-discovery-empty"><Users size={22}/><b>{postsStatus === 'loading' ? 'Memuat aktivitas…' : 'Belum ada aktivitas yang cocok'}</b><span>Aktivitas komunitas akan tampil jika informasinya tersedia.</span></div>}
    </section>

    <section className="home-discovery-section" id="home-reels">
      <SectionHeading eyebrow="CERITA VISUAL" title="Reels WarkopLink" action="Lihat Semua" onAction={onOpenCommunity}/>
      {visibleReels.length ? <div className="home-reels-row">{visibleReels.slice(0, 6).map(post => <article className="home-reel-card" key={post.id}><video src={post.videoURL} poster={post.videoThumbnailURL || undefined} controls playsInline preload="none" aria-label="Video komunitas WarkopLink"/><div className="home-reel-caption"><Video size={13}/><span>{post.body?.slice(0, 66) || 'Video komunitas'}</span></div></article>)}</div> : <div className="home-discovery-empty home-reels-empty"><Video size={22}/><b>Belum ada video untuk ditampilkan</b><span>Video komunitas akan muncul di sini setelah tersedia.</span></div>}
    </section>

    <section className="home-discovery-section" id="home-events">
      <SectionHeading eyebrow="AGENDA LOKAL" title="Agenda & acara" action="Lihat Semua" onAction={onOpenCommunity}/>
      {visibleEvents.length ? <div className="home-event-list">{visibleEvents.slice(0, 4).map(post => {
        const linkedWarung = post.warungId ? warungs.find(item => item.id === post.warungId) : null;
        return <article className="home-event-card" key={post.id}>
          {post.eventPhotoURL ? <img src={post.eventPhotoURL} alt={`Poster ${post.eventKind || 'acara'}`} loading="lazy" decoding="async"/> : <div className="home-event-placeholder"><CalendarDays size={24}/></div>}
          <div className="home-event-copy"><span>{post.eventKind || 'Acara komunitas'}</span><h3>{post.body?.split('\n')[0]?.slice(0, 76) || 'Agenda komunitas'}</h3><p><CalendarDays size={13}/>{eventDateLabel(post.eventStartAt)}</p>{(linkedWarung?.name || post.location) && <small>{linkedWarung?.name || post.location}</small>}</div>
          <button type="button" onClick={() => onOpenPost?.(post)} aria-label="Lihat detail acara"><ArrowUpRight size={18}/></button>
        </article>;
      })}</div> : <div className="home-discovery-empty"><CalendarDays size={22}/><b>Belum ada agenda mendatang</b><span>Acara akan muncul setelah jadwalnya dipublikasikan.</span></div>}
    </section>
  </div>;
}
