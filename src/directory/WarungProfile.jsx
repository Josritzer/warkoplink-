import { useCallback, useEffect, useState } from 'react';
import { collection, deleteDoc, doc, getCountFromServer, getDoc, limit, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { ArrowLeft, MapPin, ShieldCheck, Store, Users, UserPlus, UserRoundCheck, Clock, CalendarDays, Share2 } from 'lucide-react';
import { ACTIVITY_OPTIONS } from './directoryFilters.js';
import { buildGoogleMapsDirectionsUrl } from './mapLocation.js';
import { uploadWarkopMedia } from '../media/uploadWarkopMedia.js';
import { validateImageFile } from '../media/imagePolicy.js';

export default function WarungProfile({ warungId, db, user, onBack, onRequestAuth, onNotice }) {
  const [warung, setWarung] = useState(null);
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState('loading');
  const [following, setFollowing] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [busy, setBusy] = useState(false);
  const [hoursDraft, setHoursDraft] = useState({});
  const [open24Hours, setOpen24Hours] = useState(false);
  const [activityDraft, setActivityDraft] = useState([]);
  const [menuItemsDraft, setMenuItemsDraft] = useState('');
  const [specialtiesDraft, setSpecialtiesDraft] = useState('');
  const [facilitiesDraft, setFacilitiesDraft] = useState('');
  const [ambienceDraft, setAmbienceDraft] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventKind, setEventKind] = useState('Nobar');
  const [eventStart, setEventStart] = useState('');
  const [eventEnd, setEventEnd] = useState('');
  const [eventPhoto, setEventPhoto] = useState(null);
  const [pendingEventId, setPendingEventId] = useState('');
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
      setMenuItemsDraft(Array.isArray(data.menuItems) ? data.menuItems.join(', ') : '');
      setSpecialtiesDraft(Array.isArray(data.specialties) ? data.specialties.join(', ') : '');
      setFacilitiesDraft(Array.isArray(data.facilities) ? data.facilities.join(', ') : '');
      setAmbienceDraft(typeof data.ambience === 'string' ? data.ambience : '');
      const schedule = data.openingHours?.schedule || {};
      setHoursDraft(Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map((day) => [day, {
        closed: schedule[day]?.closed === true || !schedule[day],
        open: schedule[day]?.open || '08:00',
        close: schedule[day]?.close || '23:00'
      }])));
      setStatus('ready');
    }, () => setStatus('error'));
  }, [db, warungId]);


  // Acara publik yang menyimpan warungId selalu muncul pada profil penyelenggaranya.
  useEffect(() => {
    if (!db || !warungId) {
      setEvents([]);
      return undefined;
    }
    const eventsQuery = query(collection(db, 'posts'), where('warungId', '==', warungId), limit(30));
    return onSnapshot(eventsQuery, (snapshot) => {
      const linkedEvents = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
        .filter(item => item.topic === 'Info & Acara')
        .sort((a, b) => new Date(a.eventStartAt || 0).getTime() - new Date(b.eventStartAt || 0).getTime());
      setEvents(linkedEvents);
    }, () => setEvents([]));
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
        if (warung?.ownerUid && warung.ownerUid !== user.uid) {
          try {
            await setDoc(doc(collection(db, 'notifications')), {
              recipientUid: warung.ownerUid, actorUid: user.uid, type: 'follow',
              warungId, createdAt: serverTimestamp(), readAt: null
            });
          } catch { /* Pengikut tetap tersimpan meski notifikasi gagal dikirim. */ }
        }
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
  const profileSchedule = warung?.openingHours?.schedule || {};
  const hasWeeklySchedule = weekdays.some(({ key }) => Object.prototype.hasOwnProperty.call(profileSchedule, key));
  const formatClock = (value) => typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) ? value.replace(':', '.') : value;

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
      const parseList = (value) => [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))].slice(0, 20);
      const menuItems = parseList(menuItemsDraft);
      const specialties = parseList(specialtiesDraft);
      const facilities = parseList(facilitiesDraft);
      if ([...menuItems, ...specialties, ...facilities].some(item => item.length > 60) || ambienceDraft.trim().length > 500) {
        onNotice('Periksa panjang isian: setiap item maksimal 60 karakter dan suasana maksimal 500 karakter.');
        return;
      }
      await updateDoc(doc(db, 'warungs', warungId), {
        openingHours, activities: activityDraft, menuItems, specialties, facilities,
        ambience: ambienceDraft.trim(), updatedAt: serverTimestamp()
      });
      onNotice('Profil warkop berhasil diperbarui.');
    } catch (error) {
      onNotice(error?.code === 'permission-denied' ? 'Penyimpanan ditolak aturan keamanan. Periksa aturan Firestore yang sudah terpasang.' : 'Perubahan belum tersimpan. Periksa koneksi lalu coba lagi.');
    } finally { setSavingDetails(false); }
  }

  async function shareEventToHome(event) {
    event.preventDefault();
    if (!isOwner || !db || !user || sharingEvent) return;
    setSharingEvent(true);
    try {
      if (pendingEventId) {
        if (!eventPhoto) throw new Error('Pilih poster acara untuk melanjutkan unggahan.');
        await uploadWarkopMedia({ user, mediaType: 'event', resourceId: pendingEventId, file: eventPhoto });
        setPendingEventId('');
        setEventPhoto(null);
        onNotice('Poster acara berhasil diunggah.');
        return;
      }
      const title = eventTitle.trim();
      const description = eventDescription.trim();
      const start = new Date(`${eventStart}:00+07:00`);
      const end = eventEnd ? new Date(`${eventEnd}:00+07:00`) : new Date(start.getTime() + 2 * 60 * 60 * 1000);
      if (title.length < 3 || title.length > 100 || description.length < 5 || !eventStart || Number.isNaN(start.getTime()) || start <= new Date() || Number.isNaN(end.getTime()) || end <= start) {
        throw new Error('Isi judul dan deskripsi acara, pilih waktu mendatang, dan pastikan waktu selesai setelah waktu mulai.');
      }
      if (eventPhoto) {
        const photoError = validateImageFile(eventPhoto);
        if (photoError) throw new Error(photoError);
      }
      const profileSnapshot = await getDoc(doc(db, 'profiles', user.uid));
      if (!profileSnapshot.exists() || typeof profileSnapshot.data()?.displayName !== 'string') throw new Error('Profil akun belum siap.');
      const profile = profileSnapshot.data();
      const body = `${title}\n\n${description}`.slice(0, 2000);
      const eventRef = doc(collection(db, 'posts'));
      await setDoc(eventRef, {
        authorId: user.uid,
        authorName: profile.displayName,
        ...(profile.photoURL ? { authorPhotoURL: profile.photoURL } : {}),
        body,
        topic: 'Info & Acara',
        postType: 'Acara Warkop',
        warungId,
        location: `${warung.name} — ${warung.address}`.slice(0, 160),
        eventDate: eventStart.slice(0, 10),
        eventStartAt: start.toISOString(),
        eventEndAt: end.toISOString(),
        eventKind,
        eventStatus: 'scheduled',
        createdAt: serverTimestamp(),
        reactions: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
        totalReactions: 0
      });
      if (eventPhoto) {
        setPendingEventId(eventRef.id);
        await uploadWarkopMedia({ user, mediaType: 'event', resourceId: eventRef.id, file: eventPhoto });
      }
      setEventTitle(''); setEventDescription(''); setEventStart(''); setEventEnd('');
      setEventPhoto(null); setPendingEventId('');
      onNotice('Acara berhasil dibagikan ke Beranda WarkopLink.');
    } catch (error) {
      onNotice(error?.message || 'Acara belum berhasil dibagikan. Periksa koneksi lalu coba lagi.');
    } finally {
      setSharingEvent(false);
    }
  }

  if (status === 'loading') return <section className="content-section warung-profile-page"><button className="button button-quiet" onClick={onBack}><ArrowLeft size={16}/> Kembali</button><div className="empty-state" role="status"><h2>Memuat profil warkop…</h2></div></section>;
  if (status !== 'ready' || !warung) return <section className="content-section warung-profile-page"><button className="button button-quiet" onClick={onBack}><ArrowLeft size={16}/> Kembali</button><div className="empty-state" role="alert"><Store size={28}/><h2>{status === 'not-found' ? 'Profil tidak tersedia' : 'Profil belum dapat dimuat'}</h2><p>Hanya warkop yang sudah terverifikasi yang memiliki profil publik.</p><button className="button button-dark" onClick={onBack}>Kembali ke direktori</button></div></section>;

  return <section className="content-section warung-profile-page" aria-labelledby="warung-profile-title">
    <button className="button button-quiet profile-back" type="button" onClick={onBack}><ArrowLeft size={16}/> Kembali ke direktori</button>
    <div className="warung-profile-cover">{warung.photos?.[0] ? <img src={warung.photos[0]} alt={`Foto utama ${warung.name}`} /> : <div className="warung-profile-cover-empty" role="img" aria-label={`Foto warkop belum tersedia untuk ${warung.name}`}><Store size={38}/><span>Foto warkop belum ditambahkan</span></div>}</div>
    {Array.isArray(warung.photos) && warung.photos.length > 0 && <div className="warung-photo-gallery" aria-label="Galeri foto warkop">{warung.photos.slice(0, 5).map((photo, index) => <img key={`${photo}-${index}`} src={photo} alt={`Foto ${warung.name} ${index + 1}`} loading="lazy" />)}</div>}
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
      <section className="warung-profile-info-block" aria-labelledby="warung-profile-hours-title">
        <h3 id="warung-profile-hours-title">Jam operasional</h3>
        {warung.openingHours?.is24Hours === true ? <p>Buka 24 jam setiap hari</p> : hasWeeklySchedule
          ? <dl className="warung-profile-hours-list">{weekdays.map(({ key, label }) => {
              const entry = profileSchedule[key];
              return <div key={key}><dt>{label}</dt><dd>{entry?.closed ? 'Tutup' : entry?.open && entry?.close ? `${formatClock(entry.open)}–${formatClock(entry.close)}` : 'Belum dicantumkan'}</dd></div>;
            })}</dl>
          : warung.openingHours?.keterangan && warung.openingHours.keterangan !== 'Jadwal mingguan tersedia di profil'
            ? <p>{warung.openingHours.keterangan}</p>
            : <p className="profile-empty-hint">Jam operasional belum dicantumkan. Hubungi warkop untuk memastikan waktu buka.</p>}
      </section>
      <section className="warung-profile-info-block"><h3>Menu utama</h3>
        {Array.isArray(warung.menuItems) && warung.menuItems.length > 0 ? <div className="facility-tags">{warung.menuItems.map((item) => <span key={item}>{item}</span>)}</div> : <p className="profile-empty-hint">Menu belum dicantumkan. Hubungi warkop untuk memastikan menu yang tersedia.</p>}
      </section>
      <section className="warung-profile-info-block"><h3>Menu spesial</h3>
        {Array.isArray(warung.specialties) && warung.specialties.length > 0 ? <div className="facility-tags">{warung.specialties.map((item) => <span key={item}>{item}</span>)}</div> : <p className="profile-empty-hint">Menu spesial belum dibagikan. Cek kembali nanti untuk rekomendasi dari pemilik.</p>}
      </section>
      <section className="warung-profile-info-block"><h3>Suasana</h3>
        {warung.ambience ? <p>{warung.ambience}</p> : <p className="profile-empty-hint">Suasana belum dideskripsikan. Lihat foto warkop atau kunjungi langsung untuk mengenalnya.</p>}
      </section>
      <section className="warung-profile-info-block"><h3>Fasilitas</h3>
        {(Array.isArray(warung.facilities) && warung.facilities.length > 0) ? <div className="facility-tags">{warung.facilities.map((facility) => <span key={facility}>{facility}</span>)}</div> : <p className="profile-empty-hint">Fasilitas belum dicantumkan. Tanyakan langsung kepada warkop sebelum berkunjung.</p>}
      </section>
      {buildGoogleMapsDirectionsUrl(warung.coordinates?.lat, warung.coordinates?.lng) && <a className="warung-map-link" href={buildGoogleMapsDirectionsUrl(warung.coordinates.lat, warung.coordinates.lng)} target="_blank" rel="noopener noreferrer">Navigasi dengan Google Maps ↗</a>}
    </div>
    <section className="warung-profile-events" aria-labelledby="warung-profile-events-title">
      <h2 id="warung-profile-events-title">Acara dari warkop ini</h2>
      {events.length ? <div className="warung-event-list">{events.map(event => {
        const [title, ...descriptionLines] = String(event.body || 'Acara warkop').split(/\r?\n/);
        const startsAt = event.eventStartAt ? new Date(event.eventStartAt) : null;
        const validStart = startsAt && !Number.isNaN(startsAt.getTime());
        const parsedEnd = event.eventEndAt ? new Date(event.eventEndAt) : null;
        const endsAt = parsedEnd && !Number.isNaN(parsedEnd.getTime()) ? parsedEnd : validStart ? new Date(startsAt.getTime() + 2 * 60 * 60 * 1000) : null;
        const eventState = event.eventStatus === 'cancelled' ? 'Dibatalkan' : !validStart ? 'Waktu belum ditentukan' : Date.now() < startsAt.getTime() ? 'Akan datang' : endsAt && Date.now() > endsAt.getTime() ? 'Selesai' : 'Berlangsung';
        return <article className={event.eventStatus === 'cancelled' ? 'warung-event-card is-cancelled' : 'warung-event-card'} key={event.id}>
          {event.eventPhotoURL && <img className="warung-event-poster" src={event.eventPhotoURL} alt={`Poster ${title}`} loading="lazy"/>}
          <div className="warung-event-copy">
            <strong>{title}</strong>
            {descriptionLines.length > 0 && <p>{descriptionLines.join(' ').trim()}</p>}
            <div className="warung-event-meta">
              {event.eventKind && <span>{event.eventKind}</span>}
              {validStart && <time dateTime={startsAt.toISOString()}>{startsAt.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</time>}
              <span className="event-lifecycle-pill" role="status">{eventState}</span>
            </div>
          </div>
        </article>;
      })}</div> : <p>Belum ada acara yang dibagikan dari warkop ini. Jelajahi obrolan komunitas atau kunjungi lagi nanti untuk melihat agenda terbaru.</p>}
    </section>
    <div className="warung-profile-posts"><h2>Aktivitas warkop</h2>{(warung.activities || []).length ? <div className="facility-tags">{warung.activities.map((activity) => <span key={activity}>{ACTIVITY_OPTIONS.find((item) => item.value === activity)?.label || activity}</span>)}</div> : <p>Aktivitas belum dicantumkan. Hubungi warkop untuk menanyakan kegiatan yang tersedia.</p>}</div>
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
        <fieldset><legend>Informasi yang ditampilkan ke pengunjung</legend>
          <label>Menu utama (pisahkan dengan koma)<input aria-label="Menu utama warkop" value={menuItemsDraft} onChange={event => setMenuItemsDraft(event.target.value)} maxLength={1200} placeholder="Kopi, teh, mi instan"/></label>
          <label>Menu spesial / andalan (pisahkan dengan koma)<input aria-label="Menu spesial warkop" value={specialtiesDraft} onChange={event => setSpecialtiesDraft(event.target.value)} maxLength={1200} placeholder="Kopi racikan, gorengan khas"/></label>
          <label>Fasilitas (pisahkan dengan koma)<input aria-label="Fasilitas warkop" value={facilitiesDraft} onChange={event => setFacilitiesDraft(event.target.value)} maxLength={1200} placeholder="Wi-Fi, toilet, parkir"/></label>
          <label>Suasana warkop<textarea aria-label="Suasana warkop" value={ambienceDraft} onChange={event => setAmbienceDraft(event.target.value)} maxLength={500} rows={3} placeholder="Ceritakan suasana dan kenyamanan warkop"/></label>
        </fieldset>
        <fieldset><legend>Aktivitas yang benar-benar tersedia</legend><div className="owner-activity-options">{ACTIVITY_OPTIONS.map((activity) => <label key={activity.value}><input type="checkbox" checked={activityDraft.includes(activity.value)} onChange={(event) => setActivityDraft((current) => event.target.checked ? [...current, activity.value] : current.filter((value) => value !== activity.value))}/>{activity.label}</label>)}</div></fieldset>
        <button className="button button-dark" type="submit" disabled={savingDetails}>{savingDetails ? 'Menyimpan…' : 'Simpan perubahan profil'}</button>
      </form>
      <div className="owner-event-tools"><h3><CalendarDays size={18}/> Tambahkan acara warkop</h3><p>Acara yang dibagikan akan langsung muncul sebagai posting di Beranda dan menu Obrolan.</p>
        <form className="warung-form" onSubmit={shareEventToHome}>
          <label>Judul acara<input value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} maxLength={100} required placeholder="Contoh: Nobar pertandingan"/></label>
          <label>Jenis acara<select value={eventKind} onChange={(event) => setEventKind(event.target.value)}><option>Nobar</option><option>Komunitas</option><option>Gim</option><option>Acara komunitas</option><option>Lainnya</option></select></label>
          <label>Deskripsi acara<textarea value={eventDescription} onChange={(event) => setEventDescription(event.target.value)} maxLength={1800} minLength={5} required rows={3} placeholder="Informasi acara, aturan, atau detail untuk pengunjung"/></label>
          <label>Waktu mulai<input type="datetime-local" value={eventStart} onChange={(event) => setEventStart(event.target.value)} required/></label>
          <label>Waktu selesai (opsional)<input type="datetime-local" value={eventEnd} onChange={(event) => setEventEnd(event.target.value)}/></label>
          <label>Poster acara (opsional, JPG/PNG/WebP, maksimal 2 MiB)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(pendingEventId)} onChange={(event) => { const file = event.target.files?.[0] || null; const error = file ? validateImageFile(file) : ''; if (error) { onNotice(error); setEventPhoto(null); event.target.value = ''; return; } setEventPhoto(file); }} /></label>
          {eventPhoto && <small>Poster dipilih: {eventPhoto.name}</small>}
          {pendingEventId && <p className="form-hint">Acara sudah tersimpan. Tekan lanjutkan untuk mengulang unggah poster.</p>}
          <button className="button button-dark" type="submit" disabled={sharingEvent}><Share2 size={16}/>{sharingEvent ? 'Memproses acara…' : pendingEventId ? 'Lanjutkan unggah poster' : 'Bagikan ke Beranda'}</button>
        </form>
      </div>
    </section>}
  </section>;
}
