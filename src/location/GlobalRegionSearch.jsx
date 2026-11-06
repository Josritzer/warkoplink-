import { useEffect, useMemo, useState } from 'react';
import { Check, MapPin, RotateCcw } from 'lucide-react';

const SEARCH_ENDPOINT = 'https://wilayah-id-api.dhanypedia.com/api/v1/regions/search';
const RESULT_LIMIT = 100;
const cache = new Map();

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('id-ID').trim();
}

function regionFromResult(item) {
  const parts = String(item.code || '').split('.');
  const provinceCode = parts[0] || '';
  const regencyCode = parts.length >= 2 ? parts.slice(0, 2).join('.') : '';
  const districtCode = parts.length >= 3 ? parts.slice(0, 3).join('.') : '';
  const villageCode = parts.length >= 4 ? parts.slice(0, 4).join('.') : '';
  const region = {
    scopeLevel: item.level,
    selectedLevel: item.level,
    selectedCode: String(item.code || ''),
    selectedName: String(item.name || ''),
    provinceCode,
    provinceName: item.level === 'province' ? item.name : item.nama_provinsi || '',
    regencyCode,
    regencyName: item.level === 'regency' ? item.name : item.nama_kabupaten || '',
    districtCode,
    districtName: item.level === 'district' ? item.name : item.nama_kecamatan || '',
    villageCode,
    villageName: item.level === 'village' ? item.name : '',
  };
  return Object.fromEntries(Object.entries(region).filter(([, value]) => value !== ''));
}

function displayLevel(level) {
  return ({ province: 'Provinsi', regency: 'Kabupaten / Kota', district: 'Kecamatan', village: 'Desa / Kelurahan' }[level] || 'Wilayah');
}

function resultSubtitle(item) {
  return [item.nama_kecamatan, item.nama_kabupaten, item.nama_provinsi].filter(Boolean).join(' · ')
    || displayLevel(item.level);
}

async function searchRegions(query, signal) {
  const key = normalize(query);
  if (cache.has(key)) return cache.get(key);
  const url = SEARCH_ENDPOINT + '?q=' + encodeURIComponent(query.trim()) + '&limit=' + RESULT_LIMIT;
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Region search unavailable');
  const payload = await response.json();
  if (!Array.isArray(payload?.data)) throw new Error('Invalid region search response');
  const needle = normalize(query);
  const results = payload.data
    .filter(item => normalize(item.name).startsWith(needle))
    .sort((a, b) => {
      const order = { province: 0, regency: 1, district: 2, village: 3 };
      return (order[a.level] ?? 9) - (order[b.level] ?? 9) || String(a.name).localeCompare(String(b.name), 'id');
    });
  cache.set(key, results);
  if (cache.size > 80) cache.delete(cache.keys().next().value);
  return results;
}

export default function GlobalRegionSearch({ value = null, onChange }) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState([]);
  const [status, setStatus] = useState('idle');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setOptions([]);
      setStatus('idle');
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    setStatus('loading');
    const timeout = window.setTimeout(() => {
      searchRegions(term, controller.signal).then(items => {
        if (!active) return;
        setOptions(items);
        setStatus('ready');
      }).catch(error => {
        if (!active || error?.name === 'AbortError') return;
        setOptions([]);
        setStatus('error');
      });
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, retry]);

  const selectedLabel = useMemo(() => {
    if (!value?.selectedName) return '';
    return [value.selectedName, value.districtName, value.regencyName, value.provinceName]
      .filter((name, index, names) => name && names.indexOf(name) === index).join(', ');
  }, [value]);

  function choose(item) {
    onChange?.(regionFromResult(item));
    setQuery('');
    setOptions([]);
    setStatus('idle');
  }

  function clearSelection() {
    onChange?.(null);
    setQuery('');
    setOptions([]);
    setStatus('idle');
  }

  return <div className="global-region-search">
    {selectedLabel && <div className="global-region-result" aria-live="polite">
      <MapPin size={16}/>
      <span><b>{selectedLabel}</b><small>Cakupan: {displayLevel(value.scopeLevel || value.selectedLevel)}</small></span>
      <Check size={16}/>
    </div>}
    {selectedLabel && <button className="global-region-change" type="button" onClick={clearSelection}><RotateCcw size={13}/> Ganti wilayah</button>}
    <label className="global-region-searchbox">
      <MapPin size={16}/>
      <input type="search" aria-label="Cari wilayah" placeholder="Cari provinsi, kota, kecamatan, atau desa…"
        value={query} onChange={event => setQuery(event.target.value)} autoComplete="off" minLength={2}/>
    </label>
    <div className="global-region-options" role="listbox" aria-label="Rekomendasi wilayah" aria-live="polite">
      {query.trim().length < 2 && <p>Ketik minimal 2 huruf. Pilih hasil di tingkat wilayah mana pun.</p>}
      {status === 'loading' && <p role="status">Mencari wilayah…</p>}
      {status === 'error' && <p role="alert">Pencarian wilayah gagal dimuat. <button type="button" onClick={() => setRetry(count => count + 1)}>Coba lagi</button></p>}
      {status === 'ready' && options.length === 0 && <p>Tidak ada wilayah yang diawali “{query.trim()}”.</p>}
      {status === 'ready' && options.slice(0, 40).map(item => <button key={item.level + ':' + item.code}
        type="button" role="option" aria-selected={value?.selectedCode === String(item.code)} onClick={() => choose(item)}>
        <span><b>{item.name}</b><small>{displayLevel(item.level)} · {resultSubtitle(item)}</small></span>
        {value?.selectedCode === String(item.code) && <Check size={15}/>}
      </button>)}
    </div>
  </div>;
}
