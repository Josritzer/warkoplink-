import { useState } from 'react';
import GlobalRegionSearch from './GlobalRegionSearch.jsx';
import { ChevronDown, Globe2, LocateFixed, MapPinned, MapPin } from 'lucide-react';

export default function GlobalLocationSelector({ value = { mode: 'all', label: 'Semua Lokasi' }, onChange, onOpenMap }) {
  const [open, setOpen] = useState(false);
  const [gpsStatus, setGpsStatus] = useState('');

  function chooseAll() {
    onChange?.({ mode: 'all', label: 'Semua Lokasi', query: '', coordinates: null });
    setGpsStatus('');
    setOpen(false);
  }

  function chooseNearby() {
    if (!navigator.geolocation?.getCurrentPosition) {
      setGpsStatus('GPS tidak tersedia di browser ini. Pilih wilayah secara manual.');
      return;
    }
    setGpsStatus('Meminta izin lokasi…');
    navigator.geolocation.getCurrentPosition(
      position => {
        onChange?.({ mode: 'nearby', label: 'Lokasi Saya', query: '',
          coordinates: { lat: position.coords.latitude, lng: position.coords.longitude } });
        setGpsStatus('');
        setOpen(false);
      },
      error => setGpsStatus(error?.code === 1
        ? 'Izin lokasi ditolak. Anda tetap bisa memilih wilayah secara manual.'
        : 'Lokasi belum dapat diperoleh. Periksa GPS atau pilih wilayah manual.'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }

  function applyRegion(selection) {
    if (!selection?.scopeLevel || !selection?.selectedCode || !selection?.selectedName) return;
    const label = [selection.selectedName, selection.districtName, selection.regencyName, selection.provinceName]
      .filter((name, index, names) => name && names.indexOf(name) === index).join(', ');
    onChange?.({ mode: 'region', label, query: '', region: selection, coordinates: null });
    setGpsStatus('');
    setOpen(false);
  }

  return <div className="global-location-selector">
    <button className="button button-quiet header-location-action" type="button"
      aria-label={'Lokasi penjelajahan: ' + (value.label || 'Semua Lokasi')} aria-expanded={open}
      aria-haspopup="dialog" onClick={() => setOpen(current => !current)} title="Atur lokasi penjelajahan">
      <MapPin size={16}/><span>{value.label || 'Semua Lokasi'}</span><ChevronDown size={14}/>
    </button>
    {open && <section className="global-location-popover" role="dialog" aria-label="Atur lokasi penjelajahan">
      <div className="global-location-popover-heading">
        <span className="global-location-icon"><MapPinned size={17}/></span>
        <div><b>Jelajahi berdasarkan lokasi</b><small>Atur cakupan konten tanpa mengubah lokasi asli warkop.</small></div>
      </div>
      <button type="button" className={value.mode === 'all' ? 'global-location-option active' : 'global-location-option'}
        aria-label="Pilih Semua Lokasi" onClick={chooseAll}>
        <Globe2 size={17}/><span><b>Semua Lokasi</b><small>Jelajahi warkop dan komunitas dari seluruh Indonesia</small></span>
        {value.mode === 'all' && <span className="global-location-check">✓</span>}
      </button>
      <button type="button" className={value.mode === 'nearby' ? 'global-location-option active' : 'global-location-option'}
        aria-label="Gunakan Lokasi Saya" onClick={chooseNearby}>
        <LocateFixed size={17}/><span><b>Lokasi Saya</b><small>Jelajahi konten di sekitar posisi GPS</small></span>
        {value.mode === 'nearby' && <span className="global-location-check">✓</span>}
      </button>
      <div className="global-location-region">
        <div className="global-location-region-title">
          <label>Cari lokasi</label>
          <p className="global-location-region-hint">Pilih skala mana pun: provinsi, kabupaten/kota, kecamatan, atau desa.</p>
        </div>
        <GlobalRegionSearch onChange={applyRegion} value={value.region || null}/>
      </div>
      <button type="button" className="global-location-option" onClick={() => { setOpen(false); onOpenMap?.(); }}>
        <MapPinned size={17}/><span><b>Jelajahi Peta</b><small>Buka direktori untuk melihat lokasi di peta</small></span>
      </button>
      {gpsStatus && <p className="global-location-status" role="status">{gpsStatus}</p>}
    </section>}
  </div>;
}
