import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Heart, Home, MapPin, MessageCircle, MessageSquare, Play, Pause, Share2, Volume2, VolumeX, UserRound, Video, X } from 'lucide-react';
import './reels.css';

const compactNumber = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 });

function initial(name) {
  return String(name || 'W').trim().slice(0, 1).toLocaleUpperCase('id-ID') || 'W';
}

function Avatar({ name, photoURL, className = '' }) {
  return <span className={`reels-avatar ${className}`}>{photoURL ? <img src={photoURL} alt="" loading="lazy"/> : <span aria-hidden="true">{initial(name)}</span>}</span>;
}

export default function ReelsExperience({
  posts = [], status = 'ready', user, verifiedWarungs = [], likedPosts = {}, likeCounts = {}, reactionSummaries = {}, replyCounts = {},
  hasMorePosts = false, loadingMorePosts = false, loadMoreError = '', onLoadMorePosts,
  onLike, onComments, onShare, onOpenProfile, onOpenWarung, onNavigate, onRetry, onCreateVideo
}) {
  const videos = useMemo(() => posts.filter(post => typeof post?.videoURL === 'string' && post.videoURL.trim()), [posts]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [playError, setPlayError] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const videoRef = useRef(null);
  const touchStart = useRef(null);
  const wheelLock = useRef(false);
  const waitingForNext = useRef(false);
  const previousLength = useRef(videos.length);
  const activePost = videos[activeIndex] || null;
  const linkedWarung = activePost?.warungId ? verifiedWarungs.find(item => item.id === activePost.warungId) : null;
  const likeCount = activePost ? (reactionSummaries[activePost.id]?.totalReactions ?? likeCounts[activePost.id] ?? activePost.totalReactions ?? 0) : 0;
  const commentCount = activePost ? (replyCounts[activePost.id] ?? activePost.commentCount ?? 0) : 0;
  const isLiked = activePost ? Boolean(likedPosts[activePost.id]) : false;

  useEffect(() => {
    setActiveIndex(index => Math.min(index, Math.max(0, videos.length - 1)));
    if (waitingForNext.current && videos.length > previousLength.current) {
      setActiveIndex(previousLength.current);
      waitingForNext.current = false;
    }
    previousLength.current = videos.length;
  }, [videos.length]);

  useEffect(() => {
    if (!activePost || !videoRef.current) return undefined;
    const video = videoRef.current;
    let mounted = true;
    setIsLoading(true);
    setPlayError(false);
    setAutoplayBlocked(false);
    setCaptionExpanded(false);
    setIsPlaying(true);
    video.muted = muted;
    const attempt = video.play();
    if (attempt?.then) {
      attempt.then(() => {
        if (mounted) { setIsPlaying(true); setAutoplayBlocked(false); }
      }).catch(() => {
        if (mounted) { setIsPlaying(false); setAutoplayBlocked(true); }
      });
    }
    return () => {
      mounted = false;
      video.pause();
    };
  }, [activePost?.id, muted]);

  const previous = useCallback(() => {
    setActiveIndex(index => Math.max(0, index - 1));
  }, []);

  const next = useCallback(() => {
    if (activeIndex < videos.length - 1) {
      setActiveIndex(index => Math.min(videos.length - 1, index + 1));
      return;
    }
    if (hasMorePosts && !loadingMorePosts && onLoadMorePosts) {
      waitingForNext.current = true;
      onLoadMorePosts();
    }
  }, [activeIndex, videos.length, hasMorePosts, loadingMorePosts, onLoadMorePosts]);

  function togglePlayback() {
    const video = videoRef.current;
    if (!video || playError) return;
    if (video.paused) {
      video.play().then(() => { setIsPlaying(true); setAutoplayBlocked(false); }).catch(() => setAutoplayBlocked(true));
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }

  function onTouchStart(event) {
    const target = event.target;
    if (target instanceof Element && target.closest('[data-reels-no-swipe]')) return;
    const point = event.touches?.[0];
    if (point) touchStart.current = { x: point.clientX, y: point.clientY };
  }

  function onTouchEnd(event) {
    const start = touchStart.current;
    touchStart.current = null;
    const point = event.changedTouches?.[0];
    if (!start || !point) return;
    const dx = point.clientX - start.x;
    const dy = point.clientY - start.y;
    if (Math.abs(dy) < 52 || Math.abs(dy) < Math.abs(dx) * 1.2) return;
    if (dy < 0) next(); else previous();
  }

  function onWheel(event) {
    if (wheelLock.current || Math.abs(event.deltaY) < 12) return;
    event.preventDefault();
    wheelLock.current = true;
    if (event.deltaY > 0) next(); else previous();
    window.setTimeout(() => { wheelLock.current = false; }, 480);
  }

  function onKeyDown(event) {
    if (event.target instanceof Element && event.target.closest('button, a, input, textarea')) return;
    if (event.key === 'ArrowDown' || event.key === 'PageDown') { event.preventDefault(); next(); }
    if (event.key === 'ArrowUp' || event.key === 'PageUp') { event.preventDefault(); previous(); }
    if (event.key === ' ' && event.target === event.currentTarget) { event.preventDefault(); togglePlayback(); }
  }

  function retryVideo() {
    setPlayError(false);
    setIsLoading(true);
    if (videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => setAutoplayBlocked(true));
    }
  }

  function handleShare() {
    if (activePost) onShare?.(activePost);
  }

  function openCreator() {
    if (activePost?.authorId) onOpenProfile?.({ uid: activePost.authorId, displayName: activePost.authorName, photoURL: activePost.authorPhotoURL });
  }

  function navigateProfile() {
    if (user?.uid) onOpenProfile?.({ uid: user.uid, displayName: user.displayName || 'Anggota WarkopLink', photoURL: user.photoURL || '' });
    else onNavigate?.('Akun');
  }

  return <section className="wl-reels" aria-label="WARKOPLINK Reels">
    <div className="reels-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onWheel={onWheel} onKeyDown={onKeyDown} tabIndex={0}>
      {activePost ? <>
        {activePost.videoThumbnailURL && <div className="reels-backdrop" style={{ backgroundImage: `url("${String(activePost.videoThumbnailURL).replaceAll('"', '%22')}")` }} aria-hidden="true"/>}
        <video
          key={activePost.id}
          ref={videoRef}
          className="reels-video"
          src={activePost.videoURL}
          poster={activePost.videoThumbnailURL || undefined}
          playsInline
          autoPlay
          loop
          muted={muted}
          preload="auto"
          aria-label={`Video dari ${activePost.authorName || 'anggota WARKOPLINK'}`}
          onLoadedData={() => setIsLoading(false)}
          onCanPlay={() => setIsLoading(false)}
          onWaiting={() => setIsLoading(true)}
          onPlaying={() => { setIsLoading(false); setIsPlaying(true); setAutoplayBlocked(false); }}
          onPause={() => setIsPlaying(false)}
          onError={() => { setIsLoading(false); setPlayError(true); }}
        />
        <div className="reels-shade" aria-hidden="true"/>
        <header className="reels-topbar" data-reels-no-swipe>
          <button className="reels-brand" type="button" onClick={() => onNavigate?.('Beranda')} aria-label="Kembali ke Beranda WARKOPLINK">
            <span className="reels-brand-mark"><Video size={16}/></span><span>WARKOP<span>LINK</span><small>REELS</small></span>
          </button>
          <div className="reels-top-context"><span className="reels-live-dot"/>KEDAI AFTER DARK</div>
          <button type="button" className="reels-close" onClick={() => onNavigate?.('Beranda')} aria-label="Tutup Reels"><X size={19}/></button>
        </header>

        <button type="button" className="reels-play-surface" onClick={togglePlayback} aria-label={isPlaying ? 'Jeda video' : 'Putar video'} data-reels-no-swipe>
          {!isPlaying && !isLoading && !playError && <span className="reels-center-play">{autoplayBlocked ? <Play size={30} fill="currentColor"/> : <Play size={28} fill="currentColor"/>}</span>}
        </button>

        {isLoading && <div className="reels-loading" role="status"><span className="reels-spinner"/><span>Menyiapkan suasana kedai…</span></div>}
        {playError && <div className="reels-error" role="alert"><span>Video ini belum dapat diputar.</span><button type="button" onClick={retryVideo}>Coba lagi</button></div>}

        <div className="reels-controls" data-reels-no-swipe>
          <button type="button" className="reels-control" onClick={previous} disabled={activeIndex === 0} aria-label="Video sebelumnya"><ArrowUp size={20}/></button>
          <span className="reels-position" aria-live="polite">{activeIndex + 1}<i>/</i>{videos.length}{loadingMorePosts && <b className="reels-small-spinner"/>}</span>
          <button type="button" className="reels-control" onClick={next} disabled={activeIndex === videos.length - 1 && !hasMorePosts} aria-label="Video berikutnya"><ArrowDown size={20}/></button>
        </div>

        <aside className="reels-action-rail" aria-label="Interaksi video" data-reels-no-swipe>
          <button type="button" className={`reels-action${isLiked ? ' is-liked' : ''}`} aria-pressed={isLiked} onClick={() => onLike?.(activePost)} aria-label={isLiked ? 'Batalkan suka' : 'Sukai video'}>
            <span className="reels-action-icon"><Heart size={23} fill={isLiked ? 'currentColor' : 'none'}/></span><span>{compactNumber.format(likeCount)}</span>
          </button>
          <button type="button" className="reels-action" onClick={() => onComments?.(activePost)} aria-label={`Buka komentar, ${commentCount}`}>
            <span className="reels-action-icon"><MessageCircle size={23}/></span><span>{compactNumber.format(commentCount)}</span>
          </button>
          <button type="button" className="reels-action" onClick={handleShare} aria-label="Bagikan video"><span className="reels-action-icon"><Share2 size={22}/></span><span>Bagikan</span></button>
          <button type="button" className="reels-action reels-sound" onClick={() => setMuted(value => !value)} aria-label={muted ? 'Aktifkan suara' : 'Bisukan video'} aria-pressed={!muted}>
            <span className="reels-action-icon">{muted ? <VolumeX size={21}/> : <Volume2 size={21}/>}</span><span>{muted ? 'Suara' : 'Aktif'}</span>
          </button>
        </aside>

        <div className="reels-caption" data-reels-no-swipe>
          {(linkedWarung || activePost.location) && <button type="button" className="reels-location" onClick={() => linkedWarung && onOpenWarung?.(linkedWarung.id)} disabled={!linkedWarung} aria-label={linkedWarung ? `Lihat profil warkop ${linkedWarung.name}` : `Lokasi ${activePost.location}`}>
            <MapPin size={14}/><span>{linkedWarung?.name || activePost.location}</span>{linkedWarung && <span aria-hidden="true">↗</span>}
          </button>}
          <div className="reels-creator-row">
            <button type="button" className="reels-creator" onClick={openCreator} aria-label={`Lihat profil ${activePost.authorName || 'kreator'}`}>
              <Avatar name={activePost.authorName} photoURL={activePost.authorPhotoURL}/><span className="reels-creator-name">{activePost.authorName || 'Anggota WARKOPLINK'}</span>
            </button>
            {activePost.topic && <span className="reels-topic">{activePost.topic}</span>}
          </div>
          {activePost.body && <p className={captionExpanded ? 'reels-caption-copy expanded' : 'reels-caption-copy'}>{activePost.body}</p>}
          {String(activePost.body || '').length > 104 && <button className="reels-caption-more" type="button" onClick={() => setCaptionExpanded(value => !value)}>{captionExpanded ? 'Lebih sedikit' : 'Selengkapnya'}</button>}
          <span className="reels-community-tag">Cerita dari kedai, untuk komunitas.</span>
        </div>

        {autoplayBlocked && !isLoading && !playError && <div className="reels-autoplay-hint" role="status">Ketuk video untuk mulai memutar</div>}
      </> : <div className="reels-empty-wrap">
        <header className="reels-topbar" data-reels-no-swipe>
          <button className="reels-brand" type="button" onClick={() => onNavigate?.('Beranda')} aria-label="Kembali ke Beranda WARKOPLINK"><span className="reels-brand-mark"><Video size={16}/></span><span>WARKOP<span>LINK</span><small>REELS</small></span></button>
          <span className="reels-top-context">KEDAI AFTER DARK</span>
          <button type="button" className="reels-close" onClick={() => onNavigate?.('Beranda')} aria-label="Tutup Reels"><X size={19}/></button>
        </header>
        <div className="reels-empty" role={status === 'error' ? 'alert' : status === 'loading' ? 'status' : 'region'}>
          {status === 'loading' ? <><span className="reels-spinner"/><h2>Mencari cerita dari kedai…</h2><p>Reels komunitas sebentar lagi hadir.</p></> : status === 'error' ? <><span className="reels-empty-icon">!</span><h2>Belum bisa memuat Reels</h2><p>Periksa koneksi lalu coba lagi.</p><button type="button" className="reels-primary-button" onClick={onRetry}>Coba lagi</button></> : <><span className="reels-empty-icon"><Video size={30}/></span><h2>Belum ada video di sekitar</h2><p>Mulai cerita dari warkop favoritmu. Video suasana, menu spesial, atau nobar berikutnya akan jadi Reels pertama komunitas.</p><button type="button" className="reels-primary-button" onClick={onCreateVideo}>Bagikan video pertama</button></>}
          {loadMoreError && <p className="reels-inline-error" role="alert">{loadMoreError}</p>}
        </div>
      </div>}

      <nav className="reels-bottom-nav" aria-label="Navigasi aplikasi" data-reels-no-swipe>
        <button type="button" onClick={() => onNavigate?.('Beranda')}><Home size={19}/><span>Beranda</span></button>
        <button type="button" className="active" aria-current="page"><Video size={19}/><span>Video</span></button>
        <button type="button" onClick={() => onNavigate?.('Cari Warkop')}><MapPin size={19}/><span>Warkop</span></button>
        <button type="button" onClick={() => onNavigate?.('Pesan')}><MessageSquare size={19}/><span>Pesan</span></button>
        <button type="button" onClick={navigateProfile}><UserRound size={19}/><span>Profil</span></button>
      </nav>
    </div>
  </section>;
}
