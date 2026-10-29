import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Coffee, Moon, Pause, Play, Sunrise } from 'lucide-react';

// Cerita suasana warkop: lapisan tampilan saja. Kartu dibentuk dari obrolan yang sudah dimuat
// (tanpa koleksi atau field baru). Saat belum ada obrolan, tampil ajakan menulis cerita.
const PROMPTS = [
  { key: 'pagi', Icon: Sunrise, title: 'Pagi di warkop', text: 'Kopi tubruk pertama, gorengan masih hangat, dan obrolan ringan sebelum berangkat kerja.' },
  { key: 'sore', Icon: Coffee, title: 'Sore yang santai', text: 'Ceritakan meja favorit, menu andalan, dan siapa yang biasa duduk di pojok.' },
  { key: 'malam', Icon: Moon, title: 'Malam yang panjang', text: 'Nonton bareng, main catur, atau sekadar duduk lama ditemani lampu temaram.' }
];

const excerpt = (text, max = 132) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
};

export default function WarkopStories({ posts = [], status, onStart, onOpen }) {
  const trackRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const stories = posts.filter(post => String(post.body || '').trim()).slice(0, 6);
  const showPosts = status === 'ready' && stories.length > 0;
  const slideCount = showPosts ? stories.length : PROMPTS.length;

  const moveTo = (index) => {
    const track = trackRef.current;
    if (!track || slideCount < 2) return;
    const next = (index + slideCount) % slideCount;
    const card = track.children[next];
    if (!card) return;
    if (typeof track.scrollTo === 'function') track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: 'smooth' });
    else track.scrollLeft = card.offsetLeft - track.offsetLeft;
    setActiveIndex(next);
  };

  useEffect(() => {
    const track = trackRef.current;
    if (!track || slideCount < 2 || paused) return undefined;
    const timer = window.setInterval(() => {
      const next = (activeIndex + 1) % slideCount;
      const card = track.children[next];
      if (card) {
        if (typeof track.scrollTo === 'function') track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: 'smooth' });
        else track.scrollLeft = card.offsetLeft - track.offsetLeft;
        setActiveIndex(next);
      }
    }, 4500);
    return () => window.clearInterval(timer);
  }, [activeIndex, paused, slideCount]);

  const syncActiveSlide = () => {
    const track = trackRef.current;
    if (!track) return;
    const cards = Array.from(track.children);
    let closest = 0;
    let distance = Infinity;
    cards.forEach((card, index) => {
      const currentDistance = Math.abs(card.offsetLeft - track.offsetLeft - track.scrollLeft);
      if (currentDistance < distance) {
        distance = currentDistance;
        closest = index;
      }
    });
    setActiveIndex(current => current === closest ? current : closest);
  };
  return <section className="warkop-stories" aria-labelledby="warkop-stories-title">
    <div className="warkop-stories-head">
      <span className="eyebrow">SUASANA WARKOP</span>
      <h3 id="warkop-stories-title">Cerita dari meja warkop</h3>
      <p>Aroma kopi, suara sendok di gelas, dan obrolan yang betah berlama-lama. Bagikan suasana warkop di sekitar Anda.</p>
    </div>
    <div className="warkop-stories-controls" aria-label="Kontrol slide suasana warkop">
      <span className="warkop-stories-status" aria-live="polite">{activeIndex + 1} / {slideCount}</span>
      <button type="button" className="story-control" aria-label="Slide sebelumnya" onClick={() => moveTo(activeIndex - 1)}><ArrowLeft size={17} aria-hidden="true" /></button>
      <button type="button" className="story-control" aria-label={paused ? 'Lanjutkan slide otomatis' : 'Jeda slide otomatis'} onClick={() => setPaused(value => !value)}>{paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}</button>
      <button type="button" className="story-control" aria-label="Slide berikutnya" onClick={() => moveTo(activeIndex + 1)}><ArrowRight size={17} aria-hidden="true" /></button>
    </div>
    <div ref={trackRef} className="warkop-stories-track" role="list" onScroll={syncActiveSlide} onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}>
      {showPosts
        ? stories.map(post => <button type="button" role="listitem" className="story-card" key={post.id} onClick={() => onOpen?.(post)}>
            <small>{post.topic || 'Ngopi Bareng'}</small>
            <p>“{excerpt(post.body)}”</p>
            <b>{post.authorName || 'Anggota komunitas'}</b>
          </button>)
        : PROMPTS.map(({ key, Icon, title, text }) => <button type="button" role="listitem" className="story-card story-card-prompt" key={key} onClick={onStart}>
            <span className="story-card-icon"><Icon size={18} aria-hidden="true"/></span>
            <b>{title}</b>
            <p>{text}</p>
            <small>Tulis ceritamu</small>
          </button>)}
    </div>
  </section>;
}
