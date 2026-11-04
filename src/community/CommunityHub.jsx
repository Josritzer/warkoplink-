import {
  ArrowLeft, ArrowRight, BriefcaseBusiness, CalendarDays, Coffee, MessageCircleQuestion, ShoppingBag, Users, Wrench
} from 'lucide-react';
import { COMMUNITY_GROUPS, getCommunityById } from './communityCatalog.js';

const COMMUNITY_ICONS = {
  coffee: Coffee,
  question: MessageCircleQuestion,
  calendar: CalendarDays,
  briefcase: BriefcaseBusiness,
  shopping: ShoppingBag,
  wrench: Wrench,
  users: Users
};

function CommunityIcon({ name, size = 22 }) {
  const Icon = COMMUNITY_ICONS[name] || Users;
  return <Icon size={size} aria-hidden="true"/>;
}

export function CommunityShortcuts({ onSelectCommunity, onViewAll }) {
  return <section className="community-shortcuts" aria-labelledby="community-shortcuts-title">
    <div className="community-section-heading">
      <div><span className="eyebrow">OBROLAN WARGA</span><h2 id="community-shortcuts-title">Kategori obrolan</h2></div>
      <button type="button" className="community-text-link" onClick={onViewAll}>Lihat semua <ArrowRight size={15}/></button>
    </div>
    <div className="community-shortcut-track">
      {COMMUNITY_GROUPS.map((community) => <button
        className="community-shortcut"
        key={community.id}
        type="button"
        onClick={() => onSelectCommunity?.(community.id)}
        aria-label={`Buka kategori obrolan ${community.name}`}
      >
        <span className="community-icon"><CommunityIcon name={community.icon}/></span>
        <span>{community.name}</span>
      </button>)}
    </div>
  </section>;
}

export function CommunityDirectory({ onSelectCommunity }) {
  return <section className="community-directory" aria-labelledby="community-directory-title">
    <div className="community-section-heading">
      <div><span className="eyebrow">7 KATEGORI OBROLAN</span><h2 id="community-directory-title">Pilih topik obrolan.</h2><p>Tujuh kategori terbuka. Pilih topik dan langsung ikut berdiskusi.</p></div>
      <span className="community-total">7 kategori</span>
    </div>
    <div className="community-directory-grid">
      {COMMUNITY_GROUPS.map((community) => <article className="community-directory-card" key={community.id}>
        <span className="community-icon"><CommunityIcon name={community.icon} size={24}/></span>
        <h3>{community.name}</h3>
        <p>{community.description}</p>
        <button type="button" className="community-open-button" onClick={() => onSelectCommunity?.(community.id)}>
          Buka kategori <ArrowRight size={15}/>
        </button>
      </article>)}
    </div>
  </section>;
}

export function CommunityGroupHeader({ communityId, onBack }) {
  const community = getCommunityById(communityId);

  if (!community) return <section className="content-section"><p>Kategori obrolan tidak ditemukan.</p><button type="button" className="button button-quiet" onClick={onBack}>Kembali</button></section>;

  return <section className="community-group-header" aria-labelledby="community-group-title">
    <button type="button" className="community-back-button" onClick={onBack}><ArrowLeft size={16}/> Semua kategori</button>
    <div className="community-group-identity">
      <span className="community-icon community-icon-large"><CommunityIcon name={community.icon} size={28}/></span>
      <div className="community-group-copy">
        <span className="eyebrow">KATEGORI OBROLAN WARKOPLINK</span>
        <h2 id="community-group-title">{community.name}</h2>
        <p>{community.description}</p>
        <small>Pilih kategori dan langsung ikut berdiskusi.</small>
      </div>
    </div>
  </section>;
}
