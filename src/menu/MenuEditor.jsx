import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { Archive, ArrowDown, ArrowUp, ImagePlus, Pencil, Plus, RefreshCw, Save, X } from 'lucide-react';
import {
  MENU_CATEGORIES, MENU_TAGS, buildMenuRegionSnapshot, buildMenuSearchTokens,
  formatMenuPrice, normalizeMenuName, validateMenuItem,
} from './menuItemContract.js';
import { publishQuarantinedMenuPhoto, uploadWarkopMedia } from '../media/uploadWarkopMedia.js';
import { validateImageFile } from '../media/imagePolicy.js';

const EMPTY_DRAFT = { name: '', description: '', categoryId: 'coffee', tags: [], priceType: 'fixed', priceAmount: '', availability: 'available' };
const AVAILABILITY_LABELS = { available: 'Tersedia', limited: 'Terbatas', sold_out: 'Habis' };
const STATUS_LABELS = { draft: 'Draft', published: 'Terbit', archived: 'Diarsipkan' };

function buildPayload({ draft, warung, user, existing, nextSortOrder }) {
  const name = draft.name.trim();
  const region = buildMenuRegionSnapshot(warung);
  return {
    schemaVersion: 1, warungId: warung.id, ownerUid: user.uid,
    name, nameNormalized: normalizeMenuName(name), description: draft.description.trim(),
    categoryId: draft.categoryId, tags: [...new Set(draft.tags)].filter(tag => MENU_TAGS.includes(tag)),
    priceType: draft.priceType, priceAmount: draft.priceType === 'unlisted' ? null : Number(draft.priceAmount),
    currency: 'IDR', photoUrl: existing?.photoUrl || null,
    status: existing?.status || 'draft', availability: draft.availability,
    isPublic: existing?.isPublic === true, source: existing?.source || 'native',
    sortOrder: Number.isInteger(existing?.sortOrder) ? existing.sortOrder : nextSortOrder,
    searchTokens: buildMenuSearchTokens([name, draft.description, ...draft.tags]),
    ...region, createdAt: existing?.createdAt || serverTimestamp(), updatedAt: serverTimestamp(),
    ...(existing?.pendingPhotoUploadId ? { pendingPhotoUploadId: existing.pendingPhotoUploadId } : {}),
  };
}

export default function MenuEditor({ db, warung, user, onNotice = () => {} }) {
  const isOwner = Boolean(user?.uid && warung?.ownerUid === user.uid);
  const [items, setItems] = useState([]);
  const [loadState, setLoadState] = useState('loading');
  const [editingId, setEditingId] = useState('');
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [photoFile, setPhotoFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [publishingPhotoId, setPublishingPhotoId] = useState('');

  useEffect(() => {
    if (!db || !warung?.id) { setItems([]); setLoadState('error'); return undefined; }
    setLoadState('loading');
    const constraints = [where('warungId', '==', warung.id), isOwner
      ? where('ownerUid', '==', user.uid)
      : where('isPublic', '==', true)];
    return onSnapshot(query(collection(db, 'warungMenuItems'), ...constraints), snapshot => {
      const next = snapshot.docs.map(entry => ({ id: entry.id, ...entry.data() }))
        .filter(item => isOwner || (item.status === 'published' && item.isPublic === true))
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'id'));
      setItems(next); setLoadState('ready');
    }, () => setLoadState('error'));
  }, [db, warung?.id, isOwner, user?.uid]);

  const legacyItems = useMemo(() => {
    const currentNames = new Set(items.map(item => normalizeMenuName(item.name)));
    return [...new Set([...(warung?.menuItems || []), ...(warung?.specialties || [])])]
      .filter(name => !currentNames.has(normalizeMenuName(name)));
  }, [items, warung?.menuItems, warung?.specialties]);

  function startNew() { setEditingId('new'); setDraft(EMPTY_DRAFT); setPhotoFile(null); }
  function startEdit(item) {
    setEditingId(item.id);
    setDraft({ name: item.name || '', description: item.description || '', categoryId: item.categoryId || 'other', tags: Array.isArray(item.tags) ? item.tags : [], priceType: item.priceType || 'fixed', priceAmount: item.priceAmount == null ? '' : String(item.priceAmount), availability: item.availability || 'available' });
    setPhotoFile(null);
  }
  function closeEditor() { setEditingId(''); setDraft(EMPTY_DRAFT); setPhotoFile(null); }

  async function saveMenu(event, publish = false) {
    event.preventDefault();
    if (!isOwner || saving) return;
    if (publish && warung.verificationStatus !== 'verified') { onNotice('Warkop harus terverifikasi sebelum menu dapat diterbitkan.'); return; }
    if (draft.priceType !== 'unlisted' && (!draft.priceAmount.trim() || !Number.isFinite(Number(draft.priceAmount)) || Number(draft.priceAmount) < 0)) { onNotice('Masukkan harga yang valid atau pilih Harga belum dicantumkan.'); return; }
    if (photoFile) { const error = validateImageFile(photoFile); if (error) { onNotice(error); return; } }
    const existing = editingId && editingId !== 'new' ? items.find(item => item.id === editingId) : null;
    const nextSortOrder = items.reduce((max, item) => Math.max(max, Number.isInteger(item.sortOrder) ? item.sortOrder : -1), -1) + 1;
    const payload = buildPayload({ draft, warung, user, existing, nextSortOrder });
    const validation = validateMenuItem(payload);
    if (!validation.valid) { onNotice(validation.errors[0] || 'Periksa kembali data menu.'); return; }

    setSaving(true);
    try {
      let menuId = existing?.id || '';
      if (existing) await updateDoc(doc(db, 'warungMenuItems', menuId), payload);
      else menuId = (await addDoc(collection(db, 'warungMenuItems'), { ...payload, status: 'draft', isPublic: false })).id;

      let pendingUploadId = existing?.pendingPhotoUploadId || '';
      let photoPublishFailed = false;
      if (photoFile) {
        const media = await uploadWarkopMedia({ user, mediaType: 'menu', warungId: warung.id, menuItemId: menuId, file: photoFile });
        if (media.quarantined && media.uploadId) {
          pendingUploadId = media.uploadId;
          await updateDoc(doc(db, 'warungMenuItems', menuId), { pendingPhotoUploadId: pendingUploadId, updatedAt: serverTimestamp() });
        } else {
          pendingUploadId = '';
          if (existing?.pendingPhotoUploadId) await updateDoc(doc(db, 'warungMenuItems', menuId), { pendingPhotoUploadId: null, updatedAt: serverTimestamp() });
        }
      }

      if (publish) {
        await updateDoc(doc(db, 'warungMenuItems', menuId), { status: 'published', isPublic: true, updatedAt: serverTimestamp() });
        if (pendingUploadId) {
          try {
            await publishQuarantinedMenuPhoto(user, warung.id, menuId, pendingUploadId);
            await updateDoc(doc(db, 'warungMenuItems', menuId), { pendingPhotoUploadId: null, updatedAt: serverTimestamp() });
          } catch {
            photoPublishFailed = true;
          }
        }
      }
      closeEditor();
      if (publish && photoPublishFailed) onNotice('Menu sudah diterbitkan, tetapi foto masih tertahan. Gunakan tombol Terbitkan foto untuk mencoba lagi.');
      else if (publish) onNotice('Menu berhasil diterbitkan.');
      else onNotice(existing ? 'Perubahan menu berhasil disimpan.' : 'Menu berhasil disimpan sebagai draft.');
    } catch (error) {
      onNotice(error?.code === 'permission-denied' ? 'Perubahan menu ditolak oleh aturan keamanan. Pastikan Anda pemilik warkop.' : error?.message || 'Menu belum berhasil disimpan. Coba lagi.');
    } finally { setSaving(false); }
  }

  async function changeAvailability(item, availability) {
    try { await updateDoc(doc(db, 'warungMenuItems', item.id), { availability, updatedAt: serverTimestamp() }); onNotice(`Status menu diubah menjadi ${AVAILABILITY_LABELS[availability]}.`); }
    catch { onNotice('Status ketersediaan belum berhasil diubah.'); }
  }
  async function archiveItem(item) {
    try { await updateDoc(doc(db, 'warungMenuItems', item.id), { status: 'archived', isPublic: false, updatedAt: serverTimestamp() }); onNotice('Menu dipindahkan ke arsip. Data tidak dihapus.'); }
    catch { onNotice('Menu belum berhasil diarsipkan.'); }
  }
  async function moveItem(item, direction) {
    const ordered = [...items].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const index = ordered.findIndex(entry => entry.id === item.id); const target = ordered[index + direction];
    if (!target) return;
    try { await Promise.all([
      updateDoc(doc(db, 'warungMenuItems', item.id), { sortOrder: target.sortOrder ?? index + direction, updatedAt: serverTimestamp() }),
      updateDoc(doc(db, 'warungMenuItems', target.id), { sortOrder: item.sortOrder ?? index, updatedAt: serverTimestamp() }),
    ]); } catch { onNotice('Urutan menu belum berhasil diperbarui.'); }
  }
  async function retryPublishPhoto(item) {
    if (!item.pendingPhotoUploadId || item.status !== 'published' || !item.isPublic) return;
    setPublishingPhotoId(item.id);
    try {
      await publishQuarantinedMenuPhoto(user, warung.id, item.id, item.pendingPhotoUploadId);
      await updateDoc(doc(db, 'warungMenuItems', item.id), { pendingPhotoUploadId: null, updatedAt: serverTimestamp() });
      onNotice('Foto menu berhasil diterbitkan.');
    } catch { onNotice('Foto masih tertahan. Periksa koneksi lalu coba lagi.'); }
    finally { setPublishingPhotoId(''); }
  }

  return <section className="warung-menu-catalog" aria-labelledby="warung-menu-title">
    <div className="warung-menu-heading"><div><span className="warung-menu-eyebrow">MENU WARKOP</span><h2 id="warung-menu-title">Daftar menu</h2></div>
      {isOwner && <button className="button button-dark" type="button" onClick={startNew}><Plus size={16}/> Tambah menu</button>}
    </div>
    {loadState === 'loading' && <p className="profile-empty-hint">Memuat menu…</p>}
    {loadState === 'error' && <p className="profile-empty-hint">Menu belum dapat dimuat. Periksa koneksi lalu muat ulang profil.</p>}
    {loadState === 'ready' && items.length === 0 && legacyItems.length > 0 && <div className="facility-tags" aria-label="Menu lama">{legacyItems.map(item => <span key={item}>{item}</span>)}</div>}
    {loadState === 'ready' && items.length === 0 && legacyItems.length === 0 && <p className="profile-empty-hint">Belum ada menu yang dibagikan. Pemilik warkop dapat menambahkan daftar menu di sini.</p>}
    {items.length > 0 && <div className="warung-menu-grid">{(isOwner ? items : items.filter(item => item.status === 'published' && item.isPublic)).map(item => <article className={`warung-menu-card ${item.status === 'archived' ? 'is-archived' : ''}`} key={item.id}>
      {item.photoUrl ? <img className="warung-menu-photo" src={item.photoUrl} alt={item.name} loading="lazy"/> : <div className="warung-menu-photo-placeholder"><ImagePlus size={22}/><span>Foto menu</span></div>}
      <div className="warung-menu-card-copy"><div className="warung-menu-card-top"><span>{MENU_CATEGORIES.find(category => category.id === item.categoryId)?.label || 'Menu'}</span>{isOwner && <span className={`warung-menu-status status-${item.status}`}>{STATUS_LABELS[item.status] || item.status}</span>}</div>
        <h3>{item.name}</h3>{item.description && <p>{item.description}</p>}<strong className="warung-menu-price">{formatMenuPrice(item.priceAmount, item.priceType)}</strong>
        <span className={`warung-menu-availability availability-${item.availability}`}>{AVAILABILITY_LABELS[item.availability] || 'Tersedia'}</span>
        {item.tags?.length > 0 && <div className="warung-menu-tags">{item.tags.slice(0, 3).map(tag => <span key={tag}>{tag.replaceAll('_', ' ')}</span>)}</div>}
        {isOwner && <div className="warung-menu-actions"><button type="button" onClick={() => startEdit(item)} aria-label={`Edit ${item.name}`}><Pencil size={15}/> Edit</button>
          <button type="button" onClick={() => moveItem(item, -1)} aria-label={`Naikkan ${item.name}`} disabled={items[0]?.id === item.id}><ArrowUp size={15}/></button>
          <button type="button" onClick={() => moveItem(item, 1)} aria-label={`Turunkan ${item.name}`} disabled={items[items.length - 1]?.id === item.id}><ArrowDown size={15}/></button>
          {item.status !== 'archived' && <button type="button" onClick={() => archiveItem(item)} aria-label={`Arsipkan ${item.name}`}><Archive size={15}/> Arsip</button>}
          {item.pendingPhotoUploadId && item.status === 'published' && <button type="button" onClick={() => retryPublishPhoto(item)} disabled={publishingPhotoId === item.id}><RefreshCw size={15}/> Terbitkan foto</button>}
          {item.status !== 'archived' && <label className="warung-menu-availability-control">Ketersediaan<select aria-label={`Ketersediaan ${item.name}`} value={item.availability} onChange={event => changeAvailability(item, event.target.value)}><option value="available">Tersedia</option><option value="limited">Terbatas</option><option value="sold_out">Habis</option></select></label>}
        </div>}
      </div>
    </article>)}</div>}
    {loadState === 'ready' && items.length > 0 && legacyItems.length > 0 && <div className="warung-menu-legacy"><span>Menu lama</span><div className="facility-tags">{legacyItems.map(item => <span key={item}>{item}</span>)}</div></div>}
    {isOwner && editingId && <form className="warung-menu-editor" onSubmit={event => saveMenu(event, false)}>
      <div className="warung-menu-editor-heading"><h3>{editingId === 'new' ? 'Tambah menu baru' : 'Edit menu'}</h3><button type="button" className="warung-menu-close" onClick={closeEditor} aria-label="Tutup editor menu"><X size={18}/></button></div>
      <label>Nama menu<input aria-label="Nama menu" value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} minLength={2} maxLength={80} required/></label>
      <label>Deskripsi<textarea aria-label="Deskripsi menu" value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} maxLength={300} rows={2}/></label>
      <div className="warung-menu-editor-row"><label>Kategori<select aria-label="Kategori menu" value={draft.categoryId} onChange={event => setDraft(current => ({ ...current, categoryId: event.target.value }))}>{MENU_CATEGORIES.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
        <label>Tipe harga<select aria-label="Tipe harga" value={draft.priceType} onChange={event => setDraft(current => ({ ...current, priceType: event.target.value, priceAmount: event.target.value === 'unlisted' ? '' : current.priceAmount }))}><option value="fixed">Harga tetap</option><option value="starting">Mulai dari</option><option value="unlisted">Harga belum dicantumkan</option></select></label></div>
      {draft.priceType !== 'unlisted' && <label>Harga<input aria-label="Harga" type="number" min="0" step="500" value={draft.priceAmount} onChange={event => setDraft(current => ({ ...current, priceAmount: event.target.value }))} required placeholder="Contoh: 15000"/></label>}
      <label>Ketersediaan<select aria-label="Ketersediaan menu" value={draft.availability} onChange={event => setDraft(current => ({ ...current, availability: event.target.value }))}><option value="available">Tersedia</option><option value="limited">Terbatas</option><option value="sold_out">Habis</option></select></label>
      <fieldset className="warung-menu-tag-picker"><legend>Label menu (opsional)</legend>{MENU_TAGS.map(tag => <label key={tag}><input type="checkbox" checked={draft.tags.includes(tag)} onChange={event => setDraft(current => ({ ...current, tags: event.target.checked ? [...current.tags, tag] : current.tags.filter(value => value !== tag) }))}/>{tag.replaceAll('_', ' ')}</label>)}</fieldset>
      <label>Foto menu (opsional, JPG/PNG/WebP, maksimal 2 MiB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { const file = event.target.files?.[0] || null; const error = file ? validateImageFile(file) : ''; if (error) { onNotice(error); event.target.value = ''; return; } setPhotoFile(file); }}/></label>
      {warung.verificationStatus !== 'verified' && <p className="form-hint">Menu dapat disimpan sebagai draft. Penerbitan publik tersedia setelah warkop terverifikasi.</p>}
      <div className="warung-menu-editor-actions"><button className="button button-quiet" type="submit" disabled={saving}><Save size={15}/>{saving ? 'Menyimpan…' : editingId === 'new' ? 'Simpan draft' : 'Simpan perubahan'}</button>
        <button className="button button-dark" type="button" disabled={saving || warung.verificationStatus !== 'verified'} onClick={event => saveMenu(event, true)}>{saving ? 'Memproses…' : 'Terbitkan menu'}</button></div>
    </form>}
  </section>;
}
