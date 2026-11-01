import { useEffect, useState } from 'react';
import { updateProfile } from 'firebase/auth';
import { collection, doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { auth } from '../firebase.js';
import { validateProfileDraft } from './profileModel.js';

const INTEREST_OPTIONS = ['Ngopi', 'Kuliner', 'Nobar', 'Gim', 'Musik', 'Komunitas', 'Kerja laptop', 'Acara lokal'];

export default function ProfileEditor({ user, db, onNotice }) {
  const [draft, setDraft] = useState({ displayName: '', username: '', bio: '', location: '', interests: [], socialLinks: { instagram: '', tiktok: '', facebook: '', website: '' } });
  const [savedUsername, setSavedUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!db || !user?.uid) { setLoading(false); return; }
      try {
        const snapshot = await getDoc(doc(db, 'profiles', user.uid));
        const data = snapshot.exists() ? snapshot.data() : {};
        if (!active) return;
        const username = typeof data.username === 'string' ? data.username : '';
        setSavedUsername(username);
        setDraft({
          displayName: data.displayName || user.displayName || '',
          username,
          bio: typeof data.bio === 'string' ? data.bio : '',
          location: typeof data.location === 'string' ? data.location : '',
          interests: Array.isArray(data.interests) ? data.interests : [],
          socialLinks: { instagram: '', tiktok: '', facebook: '', website: '', ...(data.socialLinks || {}) }
        });
      } catch {
        if (active) onNotice?.('Data profil belum dapat dimuat. Coba buka ulang menu Akun.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [db, user?.uid]);

  function updateField(key, value) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  function toggleInterest(value) {
    setDraft(current => ({
      ...current,
      interests: current.interests.includes(value)
        ? current.interests.filter(item => item !== value)
        : current.interests.length < 8 ? [...current.interests, value] : current.interests
    }));
  }

  async function save(event) {
    event.preventDefault();
    if (!user?.uid || !db || saving) return;
    const result = validateProfileDraft(draft);
    if (!result.ok) { onNotice?.(result.error); return; }
    setSaving(true);
    try {
      const { displayName, username, bio, location, interests, socialLinks } = result.value;
      const profileRef = doc(db, 'profiles', user.uid);
      const newUsernameRef = doc(db, 'usernames', username);
      const oldUsernameRef = savedUsername && savedUsername !== username ? doc(db, 'usernames', savedUsername) : null;
      await runTransaction(db, async transaction => {
        const [profileSnapshot, newUsernameSnapshot, oldUsernameSnapshot] = await Promise.all([
          transaction.get(profileRef),
          transaction.get(newUsernameRef),
          oldUsernameRef ? transaction.get(oldUsernameRef) : Promise.resolve(null)
        ]);
        if (!profileSnapshot.exists()) throw new Error('profile-not-ready');
        if (newUsernameSnapshot.exists() && newUsernameSnapshot.data()?.uid !== user.uid) throw new Error('username-taken');
        if (!newUsernameSnapshot.exists()) {
          transaction.set(newUsernameRef, { uid: user.uid, username, createdAt: serverTimestamp() });
        }
        if (oldUsernameSnapshot?.exists() && oldUsernameSnapshot.data()?.uid === user.uid) transaction.delete(oldUsernameRef);
        transaction.update(profileRef, { displayName, username, bio, location, interests, socialLinks, updatedAt: serverTimestamp() });
        transaction.set(doc(db, 'publicProfiles', user.uid), {
          uid: user.uid, displayName, username, bio, location, interests, socialLinks, updatedAt: serverTimestamp()
        }, { merge: true });
      });
      if (auth.currentUser?.uid === user.uid) await updateProfile(auth.currentUser, { displayName });
      setSavedUsername(username);
      onNotice?.('Profil berhasil diperbarui.');
    } catch (error) {
      onNotice?.(error?.message === 'username-taken'
        ? 'Username sudah digunakan anggota lain. Coba username berbeda.'
        : error?.message === 'profile-not-ready'
          ? 'Profil akun belum siap. Keluar lalu masuk kembali, kemudian coba lagi.'
          : 'Profil belum berhasil disimpan. Periksa koneksi dan aturan keamanan.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p role="status">Memuat data profil…</p>;
  return <form className="profile-editor" onSubmit={save} aria-busy={saving}>
    <div className="profile-editor-fields">
      <label>Nama tampilan<input value={draft.displayName} maxLength={60} onChange={event => updateField('displayName', event.target.value)} required /></label>
      <label>Username<input value={draft.username} maxLength={21} onChange={event => updateField('username', event.target.value)} placeholder="nama_anda" required /><small>3–20 karakter · huruf kecil, angka, garis bawah. Username lama dilepas saat diganti.</small></label>
      <label>Bio<textarea value={draft.bio} maxLength={160} rows={3} onChange={event => updateField('bio', event.target.value)} placeholder="Ceritakan sedikit tentang Anda…" /><small>{draft.bio.length}/160</small></label>
      <label>Lokasi<input value={draft.location} maxLength={80} onChange={event => updateField('location', event.target.value)} placeholder="Kecamatan atau kota" /></label>
    </div>
    <fieldset><legend>Minat (maksimal 8)</legend><div className="profile-interest-options">
      {INTEREST_OPTIONS.map(item => <label key={item}><input type="checkbox" checked={draft.interests.includes(item)} onChange={() => toggleInterest(item)} disabled={!draft.interests.includes(item) && draft.interests.length >= 8} />{item}</label>)}
    </div></fieldset>
    <fieldset><legend>Tautan media sosial (opsional)</legend>
      {['instagram', 'tiktok', 'facebook', 'website'].map(key => <label key={key}>{key === 'website' ? 'Website' : key[0].toUpperCase() + key.slice(1)}<input type="url" inputMode="url" placeholder="https://" value={draft.socialLinks[key] || ''} onChange={event => setDraft(current => ({ ...current, socialLinks: { ...current.socialLinks, [key]: event.target.value } }))} /></label>)}
      <small>Tautan ini ditampilkan pada profil publik jika diisi.</small>
    </fieldset>
    <button className="button button-dark" type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan profil'}</button>
  </form>;
}
