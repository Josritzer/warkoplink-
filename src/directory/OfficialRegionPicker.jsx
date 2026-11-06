import { useEffect, useState } from 'react';

// Static, CDN-cached region catalogue derived from the latest published Kemendagri reference.
// Canonical reference: Kepmendagri 300.2.2-2138/2025 as amended by 300.2.2-2430/2025.
// Source mirror: emsifa/api-wilayah-indonesia v2; use official numeric codes as identifiers.
const API_BASE = 'https://www.emsifa.com/api-wilayah-indonesia/v2';
const optionCache = new Map();

export async function fetchOfficialRegionOptions(path) {
  if (!optionCache.has(path)) {
    const request = fetch(`${API_BASE}/${path}.json`, { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error('Data wilayah tidak dapat dimuat.');
        const payload = await response.json();
        const records = Array.isArray(payload) ? payload : payload?.data;
        if (!Array.isArray(records)) throw new Error('Format data wilayah tidak valid.');
        return records
          .filter((item) => typeof item?.id === 'string' && typeof item?.name === 'string')
          .map(({ id, name }) => ({ id, name }));
      })
      .catch((error) => {
        optionCache.delete(path);
        throw error;
      });
    optionCache.set(path, request);
  }
  return optionCache.get(path);
}

export function clearOfficialRegionCache() {
  optionCache.clear();
}
function useRegionOptions(path) {
  const [options, setOptions] = useState([]);
  const [status, setStatus] = useState(path ? 'loading' : 'idle');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!path) {
      setOptions([]);
      setStatus('idle');
      return undefined;
    }
    let active = true;
    setStatus('loading');
    fetchOfficialRegionOptions(path).then((items) => {
      if (!active) return;
      setOptions(items);
      setStatus('ready');
    }).catch(() => {
      if (!active) return;
      setOptions([]);
      setStatus('error');
    });
    return () => { active = false; };
  }, [path, retry]);

  return { options, status, retry: () => setRetry((value) => value + 1) };
}

export default function OfficialRegionPicker({ onChange, value = null }) {
  const [provinceId, setProvinceId] = useState(value?.provinceCode || '');
  const [regencyId, setRegencyId] = useState(value?.regencyCode || '');
  const [districtId, setDistrictId] = useState(value?.districtCode || '');
  const [villageId, setVillageId] = useState(value?.villageCode || '');
  const [searches, setSearches] = useState({ province: '', regency: '', district: '', village: '' });
  const filterOptions = (items, key) => {
    const needle = searches[key].trim().toLocaleLowerCase('id-ID');
    return needle ? items.filter((item) => item.name.toLocaleLowerCase('id-ID').includes(needle)) : items;
  };
  const provinces = useRegionOptions('provinces');
  const regencies = useRegionOptions(provinceId ? `regencies/${provinceId}` : '');
  const districts = useRegionOptions(regencyId ? `districts/${regencyId}` : '');
  const villages = useRegionOptions(districtId ? `villages/${districtId}` : '');

  function chooseProvince(id) {
    setProvinceId(id);
    setRegencyId('');
    setDistrictId('');
    setVillageId('');
    setSearches({ province: '', regency: '', district: '', village: '' });
    onChange(null);
  }

  function chooseRegency(id) {
    setRegencyId(id);
    setDistrictId('');
    setVillageId('');
    setSearches((current) => ({ ...current, district: '', village: '' }));
    onChange(null);
  }

  function chooseDistrict(id) {
    setDistrictId(id);
    setVillageId('');
    setSearches((current) => ({ ...current, village: '' }));
    onChange(null);
  }

  function chooseVillage(id) {
    setVillageId(id);
    const province = provinces.options.find((item) => item.id === provinceId);
    const regency = regencies.options.find((item) => item.id === regencyId);
    const district = districts.options.find((item) => item.id === districtId);
    const village = villages.options.find((item) => item.id === id);
    if (!province || !regency || !district || !village) {
      onChange(null);
      return;
    }
    onChange({
      provinceCode: province.id, provinceName: province.name,
      regencyCode: regency.id, regencyName: regency.name,
      districtCode: district.id, districtName: district.name,
      villageCode: village.id, villageName: village.name,
    });
  }

  const renderStatus = (label, state, retry) => {
    if (state === 'loading') return <small role="status">Memuat {label.toLowerCase()}…</small>;
    if (state === 'error') return <small className="form-error" role="alert">Data {label.toLowerCase()} gagal dimuat. Periksa koneksi lalu <button className="button button-quiet" type="button" onClick={retry}>coba lagi</button>.</small>;
    return null;
  };

  return <div className="official-region-picker">
    <label>Provinsi
      <input type="search" aria-label="Cari provinsi" placeholder="Cari provinsi…" value={searches.province} onChange={(event) => setSearches((current) => ({ ...current, province: event.target.value }))}/>
      <select aria-label="Provinsi" value={provinceId} disabled={provinces.status !== "ready"} onChange={(event) => chooseProvince(event.target.value)} required>
        <option value="">Pilih provinsi</option>
        {filterOptions(provinces.options, 'province').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    {renderStatus('provinsi', provinces.status, provinces.retry)}
    <label>Kabupaten/Kota
      <input type="search" aria-label="Cari kabupaten/kota" placeholder="Cari kabupaten/kota…" value={searches.regency} onChange={(event) => setSearches((current) => ({ ...current, regency: event.target.value }))}/>
      <select aria-label="Kabupaten/Kota" value={regencyId} onChange={(event) => chooseRegency(event.target.value)} disabled={!provinceId || regencies.status !== 'ready'} required>
        <option value="">Pilih kabupaten/kota</option>
        {filterOptions(regencies.options, 'regency').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    {renderStatus('kabupaten/kota', regencies.status, regencies.retry)}
    <label>Kecamatan
      <input type="search" aria-label="Cari kecamatan" placeholder="Cari kecamatan…" value={searches.district} onChange={(event) => setSearches((current) => ({ ...current, district: event.target.value }))}/>
      <select aria-label="Kecamatan" value={districtId} onChange={(event) => chooseDistrict(event.target.value)} disabled={!regencyId || districts.status !== 'ready'} required>
        <option value="">Pilih kecamatan</option>
        {filterOptions(districts.options, 'district').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    {renderStatus('kecamatan', districts.status, districts.retry)}
    <label>Desa/Kelurahan
      <input type="search" aria-label="Cari desa/kelurahan" placeholder="Cari desa/kelurahan…" value={searches.village} onChange={(event) => setSearches((current) => ({ ...current, village: event.target.value }))}/>
      <select aria-label="Desa/Kelurahan" value={villageId} onChange={(event) => chooseVillage(event.target.value)} disabled={!districtId || villages.status !== 'ready'} required>
        <option value="">Pilih desa/kelurahan</option>
        {filterOptions(villages.options, 'village').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    {renderStatus('desa/kelurahan', villages.status, villages.retry)}
    <small>Nama dan kode wilayah mengikuti referensi administrasi Kemendagri. Pilih berurutan dari atas.</small>
  </div>;
}
