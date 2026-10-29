import { useCallback, useEffect, useState } from 'react';
import { collection, deleteDoc, doc, getCountFromServer, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { ArrowLeft, MapPin, ShieldCheck, Store, Users, UserPlus, UserRoundCheck } from 'lucide-react';

export default function WarungProfile({ warungId, db, user, onBack, onRequestAuth, onNotice }) {
  const [warung, setWarung] = useState(null);
  const [status, setStatus] = useState('loading');
  const [following, setFollowing] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [busy, setBusy] = useState(false);

  const refreshFollowState = useCallback(async () => {
    if (!db || !warungId) return;
    try {
      const followersRef = collection(db, 'warungs', warungId, 'followers');
      const count = await getCountFromServer(followersRef);
      setFollowers(count.data().count);
      if (user?.uid) {
        const followDoc = await getDoc(doc(db, 'warungs', warungId, 'followers', user.uid));
        setFollowing(followDoc.exists());
      } else {
        setFollowing(false);
      }
    } catch {
      // Halaman profil tetap dapat dibaca bila hitungan pengikut gagal.
    }
  }, [db, warungId, user?.uid]);

  useEffect(() => {
    if (!db || !warungId) {
      setStatus('error');
      return undefined;
    }
    setStatus('loading');
    return onSnapshot(doc(db, 'warungs', warungId), (snapshot) => {
      if (!snapshot.exists() || snapshot.data().verificationStatus !== 'verified') {
        setWarung(null);
        setStatus('not-found');
        return;
      }
      setWarung({ id: snapshot.id, ...snapshot.data() });
      setStatus('ready');
    }, () => setStatus('error'));
  }, [db, warungId]);

  useEffect(() => { refreshFollowState(); }, [refreshFollowState]);

  async function toggleFollow() {
    if (!user) {
      onRequestAuth();
      onNotice('Masuk atau buat akun untuk mengikuti warkop.');
      return;
    }
    if (!db || !warungId || busy) return;
    setBusy(true);
    const nextFollowing = !following;
    setFollowing(nextFollowing);
    setFollowers((count) => Math.max(0, count + (nextFollowing ? 1 : -1)));
    try {
      const followRef = doc(db, 'warungs', warungId, 'followers', user.uid);
      if (nextFollowing) {
        await setDoc(followRef, { uid: user.uid, createdAt: serverTimestamp() });
      } else {
        await deleteDoc(followRef);
      }
      await refreshFollowState();
      onNotice(nextFollowing ? 'Warkop berhasil diikuti.' : 'Anda berhenti mengikuti warkop ini.');
    } catch (error) {
      setFollowing(!nextFollowing);
      setFollowers((count) => Math.max(0, count + (nextFollowing ? -1 : 1)));
      onNotice(error?.code === 'permission-denied'
        ? 'Aksi mengikuti ditolak oleh aturan keamanan. Pastikan warkop sudah terverifikasi.'
        : 'Perubahan pengikut belum tersimpan. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'loading') return <section className="content-section warung-profile-page"><button className="button button-quiet" onClick={onBack}><ArrowLeft size={16}/> Kembali</button><div className="empty-state" role="status"><h2>Memuat profil warkop…</h2></div></section>;
  if (status !== 'ready' || !warung) return <section className="content-section warung-profile-page"><button className="button button-quiet" onClick={onBack}><ArrowLeft size={16}/> Kembali</button><div className="empty-state" role="alert"><Store size={28}/><h2>{status === 'not-found' ? 'Profil tidak tersedia' : 'Profil belum dapat dimuat'}</h2><p>Hanya warkop yang sudah terverifikasi yang memiliki profil publik.</p><button className="button button-dark" onClick={onBack}>Kembali ke direktori</button></div></section>;

  return <section className="content-section warung-profile-page" aria-labelledby="warung-profile-title">
    <button className="button button-quiet profile-back" type="button" onClick={onBack}><ArrowLeft size={16}/> Kembali ke direktori</button>
    <div className="warung-profile-cover" aria-hidden="true"><Store size={38}/></div>
    <div className="warung-profile-heading">
      <div className="warung-profile-avatar"><Store size={30}/></div>
      <div className="warung-profile-title-group">
        <h1 id="warung-profile-title">{warung.name}</h1>
        <span className="warung-verified"><ShieldCheck size={15}/> Warkop terverifikasi</span>
      </div>
      <button className={following ? 'button button-quiet warung-follow-button following' : 'button button-dark warung-follow-button'} type="button" onClick={toggleFollow} disabled={busy} aria-pressed={following}>
        {following ? <UserRoundCheck size={16}/> : <UserPlus size={16}/>} {busy ? 'Menyimpan…' : following ? 'Mengikuti' : 'Ikuti'}
      </button>
    </div>
    <div className="warung-profile-stats"><div><Users size={17}/><strong>{followers.toLocaleString('id-ID')}</strong><span>pengikut</span></div><div><ShieldCheck size={17}/><strong>Resmi</strong><span>status verifikasi</span></div></div>
    <div className="warung-profile-details">
      <h2>Tentang warkop</h2>
      <p className="warung-profile-address"><MapPin size={17}/>{warung.address}</p>
      {warung.openingHours?.keterangan && <p><strong>Jam buka:</strong> {warung.openingHours.keterangan}</p>}
      <p><strong>Kisaran harga:</strong> {warung.priceRange === 'belum-diisi' ? 'Belum diisi' : warung.priceRange}</p>
      {(warung.facilities || []).length > 0 && <div className="facility-tags">{warung.facilities.map((facility) => <span key={facility}>{facility}</span>)}</div>}
      {Number.isFinite(warung.coordinates?.lat) && Number.isFinite(warung.coordinates?.lng) && <a className="warung-map-link" href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(warung.coordinates.lat + ',' + warung.coordinates.lng)} target="_blank" rel="noopener noreferrer">Lihat lokasi di peta ↗</a>}
    </div>
    <div className="warung-profile-posts"><h2>Aktivitas warkop</h2>{(warung.activities || []).length ? <div className="facility-tags">{warung.activities.map((activity) => <span key={activity}>{ACTIVITY_OPTIONS.find((item) => item.value === activity)?.label || activity}</span>)}</div> : <p>Aktivitas belum ditambahkan oleh pemilik.</p>}</div>
    {isOwner && <section className="warung-owner-tools" aria-labelledby="warung-owner-tools-title">
      <h2 id="warung-owner-tools-title">Kelola profil warkop</h2>
      <p>Pengaturan ini hanya tersedia untuk pemilik warkop yang terdaftar.</p>
      <form className="warung-form" onSubmit={saveWarungDetails}>
        <fieldset><legend><Clock size={16}/> Jam operasional</legend>
          <label className="owner-24h-option"><input type="checkbox" checked={open24Hours} onChange={(event) => setOpen24Hours(event.target.checked)}/> Warkop buka 24 jam setiap hari</label>
          {!open24Hours && <div className="opening-hours-editor">{weekdays.map(({ key, label }) => <div className="opening-hours-row" key={key}>
            <strong>{label}</strong><label className="closed-day"><input type="checkbox" checked={hoursDraft[key]?.closed === true} onChange={(event) => setHoursDraft((current) => ({ ...current, [key]: { ...current[key], closed: event.target.checked } }))}/> Tutup</label>
            <label>Buka<input aria-label={`${label}, jam buka`} type="time" value={hoursDraft[key]?.open || '08:00'} disabled={hoursDraft[key]?.closed} onChange={(event) => setHoursDraft((current) => ({ ...current, [key]: { ...current[key], open: event.target.value } }))}/></label>
            <label>Tutup<input aria-label={`${label}, jam tutup`} type="time" value={hoursDraft[key]?.close || '23:00'} disabled={hoursDraft[key]?.closed} onChange={(event) => setHoursDraft((current) => ({ ...current, [key]: { ...current[key], close: event.target.value } }))}/></label>
          </div>)}</div>}
        </fieldset>
        <fieldset><legend>Aktivitas yang benar-benar tersedia</legend><div className="owner-activity-options">{ACTIVITY_OPTIONS.map((activity) => <label key={activity.value}><input type="checkbox" checked={activityDraft.includes(activity.value)} onChange={(event) => setActivityDraft((current) => event.target.checked ? [...current, activity.value] : current.filter((value) => value !== activity.value))}/>{activity.label}</label>)}</div></fieldset>
        <button className="button button-dark" type="submit" disabled={savingDetails}>{savingDetails ? 'Menyimpan…' : 'Simpan jam & aktivitas'}</button>
      </form>
      <div className="owner-event-tools"><h3><CalendarDays size={18}/> Tambahkan acara warkop</h3><p>Acara yang dibagikan akan langsung muncul sebagai posting di Beranda dan menu Obrolan.</p>
        <form className="warung-form" onSubmit={shareEventToHome}>
          <label>Judul acara<input value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} maxLength={100} required placeholder="Contoh: Nobar pertandingan"/></label>
          <label>Jenis acara<select value={eventKind} onChange={(event) => setEventKind(event.target.value)}><option>Nobar</option><option>Komunitas</option><option>Gim</option><option>Acara komunitas</option><option>Lainnya</option></select></label>
          <label>Deskripsi acara<textarea value={eventDescription} onChange={(event) => setEventDescription(event.target.value)} maxLength={1800} minLength={5} required rows={3} placeholder="Informasi acara, aturan, atau detail untuk pengunjung"/></label>
          <label>Waktu mulai<input type="datetime-local" value={eventStart} onChange={(event) => setEventStart(event.target.value)} required/></label>
          <label>Waktu selesai (opsional)<input type="datetime-local" value={eventEnd} onChange={(event) => setEventEnd(event.target.value)}/></label>
          <button className="button button-dark" type="submit" disabled={sharingEvent}><Share2 size={16}/>{sharingEvent ? 'Membagikan acara…' : 'Bagikan ke Beranda'}</button>
        </form>
      </div>
    </section>}
  </section>;
}
