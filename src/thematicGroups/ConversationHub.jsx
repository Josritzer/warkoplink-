import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import {
  Briefcase, BriefcaseBusiness, CalendarDays, Camera, Dumbbell, Store, Users
} from 'lucide-react';
import { CommunityDirectory } from '../community/CommunityHub.jsx';
import { THEMATIC_GROUPS } from './thematicGroupCatalog.js';
import { isGroupUnread } from './groupUnread.js';

const GROUP_ICONS = {
  store: Store,
  'briefcase-business': BriefcaseBusiness,
  briefcase: Briefcase,
  'calendar-days': CalendarDays,
  volleyball: Dumbbell,
  camera: Camera,
  users: Users
};

function GroupIcon({ name }) {
  const Icon = GROUP_ICONS[name] || Users;
  return <Icon size={23} aria-hidden="true"/>;
}

export function ThematicGroupDirectory({ onSelectGroup, unreadGroups = {} }) {
  return <section className="thematic-directory" aria-labelledby="thematic-directory-title">
    <div className="community-section-heading">
      <div>
        <span className="eyebrow">RUANG PERCAKAPAN BERSAMA</span>
        <h2 id="thematic-directory-title">Temukan grup yang sesuai.</h2>
        <p>Tujuh ruang percakapan untuk bertukar informasi, pengalaman, dan membangun koneksi.</p>
      </div>
      <span className="community-total">7 grup</span>
    </div>
    <div className="thematic-directory-list">
      {THEMATIC_GROUPS.map((group) => <article className="thematic-directory-item" key={group.id}>
        <span className="thematic-group-icon"><GroupIcon name={group.icon}/></span>
        <div className="thematic-group-copy">
          <h3>{group.name}</h3>
          <p>{group.description}</p>
          <small>Ruang percakapan · Anggota bebas bergabung dan keluar</small>
        </div>
        <div className="thematic-directory-actions">
          {unreadGroups[group.id] && <span className="thematic-unread-badge" aria-label="Ada pesan belum dibaca"><i/>Pesan baru</span>}
          <button type="button" className="thematic-open-button" onClick={() => onSelectGroup?.(group.id)} aria-label={`Buka grup ${group.name}`}>
            Buka grup
          </button>
        </div>
      </article>)}
    </div>
  </section>;
}

export default function ConversationHub({ db, user, onSelectCommunity, onSelectThematicGroup }) {
  const [activeTab, setActiveTab] = useState('thematic');
  const [unreadGroups, setUnreadGroups] = useState({});

  useEffect(() => {
    let active = true;
    setUnreadGroups({});
    if (!db || !user?.uid) return undefined;
    Promise.all(THEMATIC_GROUPS.map(async (group) => {
      try {
        const membership = await getDoc(doc(db, 'thematicGroups', group.id, 'members', user.uid));
        if (!membership.exists()) return null;
        const latestSnapshot = await getDocs(query(
          collection(db, 'thematicGroups', group.id, 'messages'),
          orderBy('createdAt', 'desc'),
          limit(1)
        ));
        const latestMessage = latestSnapshot.docs[0]?.data();
        return latestMessage && isGroupUnread(membership.data()?.lastReadAt, latestMessage.createdAt)
          ? group.id
          : null;
      } catch {
        return null;
      }
    })).then((results) => {
      if (!active) return;
      setUnreadGroups(Object.fromEntries(results.filter(Boolean).map((id) => [id, true])));
    });
    return () => { active = false; };
  }, [db, user?.uid]);

  return <section className="conversation-hub" aria-label="Pusat obrolan">
    <div className="conversation-hub-heading">
      <div><span className="eyebrow">PUSAT PERCAKAPAN</span><h1>Obrolan</h1></div>
      <p>Pilih ruang untuk berbagi dan terhubung.</p>
    </div>
    <div className="conversation-hub-tabs" role="tablist" aria-label="Jenis ruang obrolan">
      <button type="button" role="tab" aria-selected={activeTab === 'thematic'} className={activeTab === 'thematic' ? 'is-active' : ''} onClick={() => setActiveTab('thematic')}>Grup Tematik</button>
      <button type="button" role="tab" aria-selected={activeTab === 'community'} className={activeTab === 'community' ? 'is-active' : ''} onClick={() => setActiveTab('community')}>Komunitas</button>
    </div>
    <div role="tabpanel" className="conversation-hub-panel">
      {activeTab === 'thematic'
        ? <ThematicGroupDirectory onSelectGroup={onSelectThematicGroup} unreadGroups={unreadGroups}/>
        : <CommunityDirectory onSelectCommunity={onSelectCommunity}/>}
    </div>
  </section>;
}
