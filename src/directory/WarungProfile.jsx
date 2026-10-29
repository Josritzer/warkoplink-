import { useCallback, useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getCountFromServer, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { ArrowLeft, MapPin, ShieldCheck, Store, Users, UserPlus, UserRoundCheck, Clock, CalendarDays, Share2 } from 'lucide-react';
import { ACTIVITY_OPTIONS } from './directoryFilters.js';

export default function WarungProfile({ warungId, db, user, onBack, onRequestAuth, onNotice }) {
  const [warung, setWarung] = useState(null);
  const [status, setStatus] = useState('loading');
  const [following, setFollowing] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [busy, setBusy] = useState(false);
  const [hoursDraft, setHoursDraft] = useState({});
  const [open24Hours, setOpen24Hours] = useState(false);
  const [activityDraft, setActivityDraft] = useState([]);
  const [savingDetails, setSavingDetails] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventKind, setEventKind] = useState('Nobar');
  const [eventStart, setEventStart] = useState('');
  const [eventEnd, setEventEnd] = useState('');
  const [sharingEvent, setSharingEvent] = useState(false);

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
      const data = { id: snapshot.id, ...snapshot.data() };
      setWarung(data);
      setOpen24Hours(data.openingHours?.is24Hours === true);
      setActivityDraft(Array.isArray(data.activities) ? data.activities : []);
      const schedule = data.openingHours?.schedule || {};
      setHoursDraft(Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map((day) => [day, {
        closed: schedule[day]?.closed === true,
        open: schedule[day]?.open || '08:00',
        close: schedule[day]?.close || '23:00'
      }])));
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

  const isOwner = Boolean(user?.uid && warung?.ownerUid === user.uid);
  const weekdays = [{ key: 'mon', label: 'Senin' }, { key: 'tue', label: 'Selasa' }, { key: 'wed', label: 'Rabu' }, { key: 'thu', label: 'Kamis' }, { key: 'fri', label: 'Jumat' }, { key: 'sat', label: 'Sabtu' }, { key: 'sun', label: 'Minggu' }];

  async function saveWarungDetails(event) {
    event.preventDefault();
    if (!isOwner || !db || savingDetails) return;
    if (!open24Hours && weekdays.some(({ key }) => !hoursDraft[key]?.closed && (!hoursDraft[key]?.open || !hoursDraft[key]?.close || hoursDraft[key]?.open === hoursDraft[key]?.close))) {
      onNotice('Periksa jam buka dan tutup setiap hari. Jam yang sama tidak dianggap jadwal valid.');
      return;
    }
    setSavingDetails(true);
    try {
      const openingHours = open24Hours ? { is24Hours: true } : {
        is24Hours: false,
        schedule: Object.fromEntries(weekdays.map(({ key }) => [key, hoursDraft[key]?.closed ? { closed: true } : { open: hoursDraft[key].open, close: hoursDraft[key].close }])),
        keterangan: 'Jadwal mingguan tersedia di profil'
      };
      await updateDoc(doc(db, 'warungs', warungId), { openingHours, activities: activityDraft, updatedAt: serverTimestamp() });
      onNotice('Jam operasional dan aktivitas warkop berhasil disimpan.');
    } catch (error) {
      onNotice(error?.code === 'permission-denied' ? 'Penyimpanan ditolak aturan keamanan. Periksa aturan Firestore yang sudah terpasang.' : 'Perubahan belum tersimpan. Periksa koneksi lalu coba lagi.');
    } finally { setSavingDetails(false); }
  }

  async function shareEventToHome(event) {
    event.preventDefault();
    if (!isOwner || !db || !user || sharingEvent) return;
    const title = eventTitle.trim();
    const description = eventDescription.trim();
    const start = new Date(eventStart);
    const end = eventEnd ? new Date(eventEnd) : new Date(start.getTime() + 2 * 60 * 60 * 1000);
    if (title.length < 3 || title.length > 100 || description.length < 5 || !eventStart || Number.isNaN(start.getTime()) || start <= new Date() || Number.isNaN(end.getTime()) || end <= start) {
      onNotice('Isi judul dan deskripsi acara, pilih waktu mendatang, dan pastikan waktu selesai setelah waktu mulai.');
      return;
    }
    setSharingEvent(true);
    try {
      const profileSnapshot = await getDoc(doc(db, 'profiles', user.uid));
      if (!profileSnapshot.exists() || typeof profileSnapshot.data()?.displayName !== 'string') throw new Error('profile-missing');
      const profile = profileSnapshot.data();
      const body = `${title}\n\n${description}`.slice(0, 2000);
      await addDoc(collection(db, 'posts'), {
        authorId: user.uid,
        authorName: profile.displayName,
        ...(profile.photoURL ? { authorPhotoURL: profile.photoURL } : {}),
        body,
        topic: 'Info & Acara',
        postType: 'Acara Warkop',
        location: `${warung.name} — ${warung.address}`.slice(0, 160),
        eventDate: start.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }),
        eventStartAt: start.toISOString(),
        eventEndAt: end.toISOString(),
        eventKind,
        eventStatus: 'scheduled',
        createdAt: serverTimestamp(),
        reactions: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
        totalReactions: 0
      });
      setEventTitle(''); setEventDescription(''); setEventStart(''); setEventEnd('');
      onNotice('Acara berhasil dibagikan ke Beranda WarkopLink.');
    } catch (error) {
      onNotice(error?.code === 'permission-denied' ? 'Acara ditolak aturan keamanan. Pastikan profil akun tersedia dan aturan Firestore terbaru sudah terpasang.' : 'Acara belum berhasil dibagikan. Periksa koneksi dan profil akun.');
    } finally { setSharingEvent(false); }
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
    <div className="warung-profile-posts"><h2>Obrolan warkop</h2><p>Postingan resmi atas nama warkop akan dibuka setelah alur verifikasi pengelola tersedia. Untuk sekarang, profil ini menjadi sumber informasi warkop yang terverifikasi.</p></div>
  </section>;
}
