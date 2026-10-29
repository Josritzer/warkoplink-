import { Coffee, Moon, Sunrise } from 'lucide-react';

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
  const stories = posts.filter(post => String(post.body || '').trim()).slice(0, 6);
  const showPosts = status === 'ready' && stories.length > 0;
  return <section className="warkop-stories" aria-labelledby="warkop-stories-title">
    <div className="warkop-stories-head">
      <span className="eyebrow">SUASANA WARKOP</span>
      <h3 id="warkop-stories-title">Cerita dari meja warkop</h3>
      <p>Aroma kopi, suara sendok di gelas, dan obrolan yang betah berlama-lama. Bagikan suasana warkop di sekitar Anda.</p>
    </div>
    <div className="warkop-stories-track" role="list">
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
