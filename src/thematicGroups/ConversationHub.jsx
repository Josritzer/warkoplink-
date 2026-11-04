import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import {
  ArrowRight, Briefcase, BriefcaseBusiness, CalendarDays, Camera, Dumbbell, Search, Store, Users
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

function activityTime(value) {
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const sameDay = date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
  return sameDay
    ? new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(date)
    : new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(date);
}

export function ThematicGroupDirectory({ onSelectGroup, unreadGroups = {}, groupActivity = {} }) {
  const [search, setSearch] = useState('');
  const normalizedSearch = search.trim().toLocaleLowerCase('id-ID');
  const visibleGroups = THEMATIC_GROUPS.filter((group) =>
    !normalizedSearch || `${group.name} ${group.description}`.toLocaleLowerCase('id-ID').includes(normalizedSearch)
  );

  return <section className="thematic-directory" aria-labelledby="thematic-directory-title">
    <div className="thematic-directory-intro">
      <div>
        <span className="eyebrow">RUANG PERCAKAPAN BERSAMA</span>
        <h2 id="thematic-directory-title">Grup Tematik</h2>
        <p>Temukan obrolan yang nyambung dengan kegiatan dan usahamu.</p>
      </div>
      <span className="thematic-room-count">{THEMATIC_GROUPS.length} grup</span>
    </div>
    <label className="thematic-directory-search">
      <Search size={17} aria-hidden="true"/>
      <span className="sr-only">Cari grup tematik</span>
      <input type="search" aria-label="Cari grup tematik" placeholder="Cari grup atau topik…" value={search} onChange={(event) => setSearch(event.target.value)}/>
    </label>
    <div className="thematic-directory-list" aria-label="Daftar grup tematik">
      {visibleGroups.map((group) => {
        const activity = groupActivity[group.id];
        const unread = Boolean(activity?.unread || unreadGroups[group.id]);
        const preview = activity?.lastMessage || (activity?.joined ? 'Belum ada pesan. Mulai percakapan.' : group.description);
        const lastActivity = activityTime(activity?.lastMessageAt);
        return <article className={`thematic-directory-item ${activity?.joined ? 'is-joined' : ''}`.trim()} key={group.id}>
          <span className={`thematic-group-icon thematic-group-icon-${group.id}`}><GroupIcon name={group.icon}/></span>
          <div className="thematic-group-copy">
            <div className="thematic-group-title-row">
              <h3>{group.name}</h3>
              {lastActivity && <time>{lastActivity}</time>}
            </div>
            <p className="thematic-group-preview">{preview}</p>
            <div className="thematic-group-meta">
              {activity?.joined && <span className="thematic-member-label">Anggota</span>}
              {unread && <span className="thematic-unread-badge" aria-label="Ada pesan belum dibaca"><i/>Belum dibaca</span>}
            </div>
          </div>
          <div className="thematic-directory-actions">
            <button type="button" className="thematic-open-button" onClick={() => onSelectGroup?.(group.id)} aria-label={`Buka grup ${group.name}`}>
              <span>Buka</span><ArrowRight size={17} aria-hidden="true"/>
            </button>
          </div>
        </article>;
      })}
      {!visibleGroups.length && <p className="thematic-search-empty" role="status">Grup tidak ditemukan. Coba kata kunci lain.</p>}
    </div>
  </section>;
}

export default function ConversationHub({ db, user, onSelectCommunity, onSelectThematicGroup }) {
  const [activeTab, setActiveTab] = useState('thematic');
  const [unreadGroups, setUnreadGroups] = useState({});
  const [groupActivity, setGroupActivity] = useState({});

  useEffect(() => {
    let active = true;
    setUnreadGroups({});
    setGroupActivity({});
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
        return {
          groupId: group.id,
          joined: true,
          lastMessage: String(latestMessage?.text || '').trim(),
          lastMessageAt: latestMessage?.createdAt || null,
          unread: Boolean(latestMessage && isGroupUnread(membership.data()?.lastReadAt, latestMessage.createdAt))
        };
      } catch {
        return null;
      }
    })).then((results) => {
      if (!active) return;
      const activities = results.filter(Boolean);
      setGroupActivity(Object.fromEntries(activities.map((item) => [item.groupId, item])));
      setUnreadGroups(Object.fromEntries(activities.filter((item) => item.unread).map((item) => [item.groupId, true])));
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
      <button type="button" role="tab" aria-selected={activeTab === 'community'} className={activeTab === 'community' ? 'is-active' : ''} onClick={() => setActiveTab('community')}>Kategori obrolan</button>
    </div>
    <div role="tabpanel" className="conversation-hub-panel">
      {activeTab === 'thematic'
        ? <ThematicGroupDirectory onSelectGroup={onSelectThematicGroup} unreadGroups={unreadGroups} groupActivity={groupActivity}/>
        : <CommunityDirectory onSelectCommunity={onSelectCommunity}/>}
    </div>
  </section>;
}
