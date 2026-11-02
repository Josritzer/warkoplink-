import { useEffect, useRef, useState } from 'react';
import {
  collection, deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc
} from 'firebase/firestore';
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
      <div><span className="eyebrow">RUANG WARGA</span><h2 id="community-shortcuts-title">Komunitas</h2></div>
      <button type="button" className="community-text-link" onClick={onViewAll}>Lihat semua <ArrowRight size={15}/></button>
    </div>
    <div className="community-shortcut-track">
      {COMMUNITY_GROUPS.map((community) => <button
        className="community-shortcut"
        key={community.id}
        type="button"
        onClick={() => onSelectCommunity?.(community.id)}
        aria-label={`Buka komunitas ${community.name}`}
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
      <div><span className="eyebrow">KOMUNITAS RESMI WARKOPLINK</span><h2 id="community-directory-title">Temukan komunitasmu.</h2><p>Tujuh ruang terbuka untuk berbagi minat dengan anggota dari seluruh Indonesia.</p></div>
      <span className="community-total">7 komunitas</span>
    </div>
    <div className="community-directory-grid">
      {COMMUNITY_GROUPS.map((community) => <article className="community-directory-card" key={community.id}>
        <span className="community-icon"><CommunityIcon name={community.icon} size={24}/></span>
        <h3>{community.name}</h3>
        <p>{community.description}</p>
        <button type="button" className="community-open-button" onClick={() => onSelectCommunity?.(community.id)}>
          Buka komunitas <ArrowRight size={15}/>
        </button>
      </article>)}
    </div>
  </section>;
}

export function CommunityGroupHeader({
  db, user, communityId, onBack, onNotice, onRequestAuth, onMembershipChange
}) {
  const community = getCommunityById(communityId);
  const [isMember, setIsMember] = useState(false);
  const [busy, setBusy] = useState(false);
  const membershipLock = useRef(false);

  useEffect(() => {
    let active = true;
    setIsMember(false);
    onMembershipChange?.(false);
    if (!db || !community) return undefined;

    if (!user?.uid) return () => { active = false; };
    const memberRef = doc(db, 'communities', community.id, 'members', user.uid);
    const unsubscribe = onSnapshot(memberRef, (snapshot) => {
      if (!active) return;
      const nextMember = snapshot.exists();
      setIsMember(nextMember);
      onMembershipChange?.(nextMember);
    }, () => {
      if (!active) return;
      setIsMember(false);
      onMembershipChange?.(false);
    });
    return () => { active = false; unsubscribe(); };
  }, [db, community?.id, user?.uid, onMembershipChange]);

  async function toggleMembership() {
    if (!community || !db || busy || membershipLock.current) return;
    if (!user?.uid) {
      onRequestAuth?.();
      onNotice?.('Masuk terlebih dahulu untuk bergabung dengan komunitas.');
      return;
    }
    membershipLock.current = true;
    setBusy(true);
    const memberRef = doc(db, 'communities', community.id, 'members', user.uid);
    try {
      const existing = await getDoc(memberRef);
      if (existing.exists()) {
        await deleteDoc(memberRef);
        setIsMember(false);
        onMembershipChange?.(false);
        onNotice?.('Anda sudah keluar dari komunitas.');
      } else {
        await setDoc(memberRef, { uid: user.uid, createdAt: serverTimestamp() });
        setIsMember(true);
        onMembershipChange?.(true);
        onNotice?.('Berhasil bergabung dengan komunitas. Selamat berdiskusi!');
      }
    } catch {
      onNotice?.('Keanggotaan belum berhasil diperbarui. Periksa koneksi lalu coba lagi.');
    } finally {
      membershipLock.current = false;
      setBusy(false);
    }
  }

  if (!community) return <section className="content-section"><p>Komunitas tidak ditemukan.</p><button type="button" className="button button-quiet" onClick={onBack}>Kembali</button></section>;

  return <section className="community-group-header" aria-labelledby="community-group-title">
    <button type="button" className="community-back-button" onClick={onBack}><ArrowLeft size={16}/> Semua komunitas</button>
    <div className="community-group-identity">
      <span className="community-icon community-icon-large"><CommunityIcon name={community.icon} size={28}/></span>
      <div className="community-group-copy">
        <span className="eyebrow">KOMUNITAS RESMI WARKOPLINK</span>
        <h2 id="community-group-title">{community.name}</h2>
        <p>{community.description}</p>
        <small>Terbuka untuk semua anggota WARKOPLINK</small>
      </div>
      <button type="button" className={isMember ? 'community-membership-button is-member' : 'community-membership-button'} onClick={toggleMembership} disabled={busy || !db}>
        {busy ? 'Memproses…' : isMember ? 'Keluar komunitas' : 'Gabung komunitas'}
      </button>
    </div>
  </section>;
}
