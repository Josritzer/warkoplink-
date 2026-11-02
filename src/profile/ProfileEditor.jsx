import { useEffect, useMemo, useRef, useState } from 'react';
import { updateProfile } from 'firebase/auth';
import { collection, doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { auth } from '../firebase.js';
import { validateProfileDraft } from './profileModel.js';

const INTEREST_OPTIONS = ['Ngopi', 'Kuliner', 'Nobar', 'Gim', 'Musik', 'Komunitas', 'Kerja laptop', 'Acara lokal'];
const SOCIAL_FIELDS = [
  ['instagram', 'Instagram', 'https://instagram.com/username'],
  ['tiktok', 'TikTok', 'https://tiktok.com/@username'],
  ['facebook', 'Facebook', 'https://facebook.com/username'],
  ['website', 'Website', 'https://contoh.com']
];
const EMPTY_DRAFT = { displayName: '', username: '', bio: '', location: '', interests: [], socialLinks: { instagram: '', tiktok: '', facebook: '', website: '' } };

export default function ProfileEditor({ user, db, onNotice, onBack, onPhotoChange, onPhotoRemove, photoUploading = false }) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [savedUsername, setSavedUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const photoInputRef = useRef(null);
  const [baseline, setBaseline] = useState('');
  const serialized = useMemo(() => JSON.stringify(draft), [draft]);
  const dirty = Boolean(baseline) && serialized !== baseline;

  useEffect(() => {
    let active = true;
    async function load() {
      if (!db || !user?.uid) { setLoading(false); return; }
      try {
        const snapshot = await getDoc(doc(db, 'profiles', user.uid));
        const data = snapshot.exists() ? snapshot.data() : {};
        if (!active) return;
        const username = typeof data.username === 'string' ? data.username : '';
        const next = {
          displayName: data.displayName || user.displayName || '',
          username,
          bio: typeof data.bio === 'string' ? data.bio : '',
          location: typeof data.location === 'string' ? data.location : '',
          interests: Array.isArray(data.interests) ? data.interests.slice(0, 8) : [],
          socialLinks: { instagram: '', tiktok: '', facebook: '', website: '', ...(data.socialLinks || {}) }
        };
        setSavedUsername(username);
        setDraft(next);
        setBaseline(JSON.stringify(next));
      } catch {
        if (active) onNotice?.('Data profil belum dapat dimuat. Coba buka ulang menu Akun.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [db, user?.uid]);

  useEffect(() => {
    const handleBeforeUnload = event => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  function requestBack() {
    if (dirty && !window.confirm('Perubahan profil belum disimpan. Tetap tinggalkan halaman?')) return;
    onBack?.();
  }
  function updateField(key, value) {
    setDraft(current => ({ ...current, [key]: value }));
    setFieldErrors(current => ({ ...current, [key]: '' }));
  }
  function toggleInterest(value) {
    setDraft(current => {
      if (current.interests.includes(value)) return { ...current, interests: current.interests.filter(item => item !== value) };
      if (current.interests.length >= 8) {
        onNotice?.('Maksimal 8 minat. Hapus salah satu pilihan sebelum menambahkan minat lain.');
        return current;
      }
      return { ...current, interests: [...current.interests, value] };
    });
  }

  async function save(event) {
    event.preventDefault();
    if (!user?.uid || !db || saving) return;
    const result = validateProfileDraft(draft);
    if (!result.ok) {
      const message = result.error || 'Periksa kembali data profil.';
      const errors = {};
      if (/Nama tampilan/.test(message)) errors.displayName = message;
      else if (/Username/.test(message)) errors.username = message;
      else if (/Bio/.test(message)) errors.bio = message;
      else if (/Lokasi/.test(message)) errors.location = message;
      else if (/minat/.test(message)) errors.interests = message;
      else errors.socialLinks = message;
      setFieldErrors(errors);
      onNotice?.(message);
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      const { displayName, username, bio, location, interests, socialLinks } = result.value;
      const profileRef = doc(db, 'profiles', user.uid);
      const newUsernameRef = doc(db, 'usernames', username);
      const oldUsernameRef = savedUsername && savedUsername !== username ? doc(db, 'usernames', savedUsername) : null;
      await runTransaction(db, async transaction => {
        const [profileSnapshot, newUsernameSnapshot, oldUsernameSnapshot] = await Promise.all([
          transaction.get(profileRef), transaction.get(newUsernameRef),
          oldUsernameRef ? transaction.get(oldUsernameRef) : Promise.resolve(null)
        ]);
        if (!profileSnapshot.exists()) throw new Error('profile-not-ready');
        if (newUsernameSnapshot.exists() && newUsernameSnapshot.data()?.uid !== user.uid) throw new Error('username-taken');
        if (!newUsernameSnapshot.exists()) transaction.set(newUsernameRef, { uid: user.uid, username, createdAt: serverTimestamp() });
        if (oldUsernameSnapshot?.exists() && oldUsernameSnapshot.data()?.uid === user.uid) transaction.delete(oldUsernameRef);
        transaction.update(profileRef, { displayName, username, bio, location, interests, socialLinks, updatedAt: serverTimestamp() });
        transaction.set(doc(db, 'publicProfiles', user.uid), {
          uid: user.uid, displayName, username, bio, location, interests, socialLinks, updatedAt: serverTimestamp()
        }, { merge: true });
      });
      if (auth.currentUser?.uid === user.uid) await updateProfile(auth.currentUser, { displayName });
      setSavedUsername(username);
      const nextDraft = { ...result.value, socialLinks: { instagram: '', tiktok: '', facebook: '', website: '', ...result.value.socialLinks } };
      setDraft(nextDraft);
      setBaseline(JSON.stringify(nextDraft));
      onNotice?.('Profil berhasil diperbarui.');
    } catch (error) {
      const message = error?.message === 'username-taken'
        ? 'Username sudah digunakan anggota lain. Coba username berbeda.'
        : error?.message === 'profile-not-ready'
          ? 'Profil akun belum siap. Keluar lalu masuk kembali, kemudian coba lagi.'
          : 'Profil belum berhasil disimpan. Periksa koneksi dan aturan keamanan.';
      if (error?.message === 'username-taken') setFieldErrors(current => ({ ...current, username: message }));
      onNotice?.(message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p role="status">Memuat data profil…</p>;
  return <form className="profile-editor" onSubmit={save} aria-busy={saving} noValidate>
    <section className="profile-editor-section profile-photo-section" aria-label="Foto profil">
      <div className="profile-photo-preview">{user?.photoURL ? <img src={user.photoURL} alt="Foto profil saat ini"/> : <span>{String(user?.displayName || user?.email || 'A').slice(0,1).toUpperCase()}</span>}</div>
      <div className="profile-photo-copy"><b>Foto profil</b><small>Gunakan foto yang membantu anggota mengenali Anda.</small><div className="profile-photo-buttons">
        <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onPhotoChange}/>
        <button className="button button-quiet" type="button" onClick={() => photoInputRef.current?.click()} disabled={photoUploading}>{photoUploading ? 'Memproses foto…' : 'Ubah foto'}</button>
        {user?.photoURL && <button className="button button-quiet" type="button" onClick={onPhotoRemove} disabled={photoUploading}>Hapus foto</button>}
      </div></div>
    </section>
    <section className="profile-editor-section">
      <div className="profile-section-heading"><h3>Informasi profil</h3><p>Informasi yang membantu anggota mengenal Anda.</p></div>
      <div className="profile-editor-fields">
        <label>Nama tampilan<input value={draft.displayName} maxLength={60} onChange={event => updateField('displayName', event.target.value)} autoComplete="name" required aria-invalid={Boolean(fieldErrors.displayName)} aria-describedby={fieldErrors.displayName ? 'profile-name-error' : undefined}/>{fieldErrors.displayName && <small id="profile-name-error" className="profile-field-error">{fieldErrors.displayName}</small>}</label>
        <label>Username<input value={draft.username} maxLength={21} onChange={event => updateField('username', event.target.value)} autoComplete="username" required aria-invalid={Boolean(fieldErrors.username)} aria-describedby="profile-username-help"/><small id="profile-username-help">3–20 karakter: huruf kecil, angka, dan garis bawah (_). Ketik @username untuk menyebut Anda di obrolan. Ketersediaan diperiksa saat disimpan.</small>{fieldErrors.username && <small className="profile-field-error">{fieldErrors.username}</small>}</label>
        <label>Bio<textarea value={draft.bio} maxLength={160} rows={4} onChange={event => updateField('bio', event.target.value)} aria-invalid={Boolean(fieldErrors.bio)}/><small className="profile-count">{draft.bio.length}/160 karakter</small>{fieldErrors.bio && <small className="profile-field-error">{fieldErrors.bio}</small>}</label>
        <label>Lokasi<input value={draft.location} maxLength={80} onChange={event => updateField('location', event.target.value)} autoComplete="address-level2" aria-invalid={Boolean(fieldErrors.location)}/>{fieldErrors.location && <small className="profile-field-error">{fieldErrors.location}</small>}</label>
      </div>
    </section>
    <section className="profile-editor-section">
      <div className="profile-section-heading"><h3>Minat</h3><p>Pilih topik yang Anda sukai agar obrolan terasa lebih dekat.</p></div>
      <div className="profile-interest-heading"><b>Minat pilihan</b><span aria-live="polite">{draft.interests.length}/8 dipilih</span></div>
      <div className="profile-interest-options">{INTEREST_OPTIONS.map(item => <label key={item} className={draft.interests.includes(item) ? 'selected' : ''}><input type="checkbox" checked={draft.interests.includes(item)} onChange={() => toggleInterest(item)}/><span>{item}</span></label>)}</div>
      {fieldErrors.interests && <small className="profile-field-error">{fieldErrors.interests}</small>}
    </section>
    <section className="profile-editor-section">
      <div className="profile-section-heading"><h3>Tautan media sosial</h3><p>Opsional · tautan akan terlihat di profil publik.</p></div>
      <div className="profile-editor-fields">{SOCIAL_FIELDS.map(([key, label, placeholder]) => <label key={key}>{label}<input type="url" inputMode="url" autoComplete="url" placeholder={placeholder} value={draft.socialLinks[key] || ''} onChange={event => setDraft(current => ({ ...current, socialLinks: { ...current.socialLinks, [key]: event.target.value } }))} aria-invalid={Boolean(fieldErrors.socialLinks)} /></label>)}</div>
      {fieldErrors.socialLinks && <small className="profile-field-error">{fieldErrors.socialLinks}</small>}
    </section>
    <div className="profile-editor-actions"><button className="button button-quiet" type="button" onClick={requestBack}>Kembali</button><button className="button button-dark" type="submit" disabled={saving || !dirty}>{saving ? 'Menyimpan…' : 'Simpan perubahan'}</button></div>
  </form>;
}
