import { useEffect, useState } from 'react';

// Static, CDN-cached region catalogue derived from the latest published Kemendagri reference.
// Canonical reference: Kepmendagri 300.2.2-2138/2025 as amended by 300.2.2-2430/2025.
// Source mirror: emsifa/api-wilayah-indonesia v2; use official numeric codes as identifiers.
const API_BASE = 'https://www.emsifa.com/api-wilayah-indonesia/v2';
const optionCache = new Map();

async function fetchRegionOptions(path) {
  if (!optionCache.has(path)) {
    const request = fetch(`${API_BASE}/${path}.json`, { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error('Data wilayah tidak dapat dimuat.');
        const payload = await response.json();
        if (!Array.isArray(payload?.data)) throw new Error('Format data wilayah tidak valid.');
        return payload.data
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

export function clearOfficialRegionCache() {\n  optionCache.clear();\n}\n\nfunction useRegionOptions(path) {
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
    fetchRegionOptions(path).then((items) => {
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
  const provinces = useRegionOptions('provinces');
  const regencies = useRegionOptions(provinceId ? `regencies/${provinceId}` : '');
  const districts = useRegionOptions(regencyId ? `districts/${regencyId}` : '');
  const villages = useRegionOptions(districtId ? `villages/${districtId}` : '');

  function chooseProvince(id) {
    setProvinceId(id);
    setRegencyId('');
    setDistrictId('');
    setVillageId('');
    onChange(null);
  }

  function chooseRegency(id) {
    setRegencyId(id);
    setDistrictId('');
    setVillageId('');
    onChange(null);
  }

  function chooseDistrict(id) {
    setDistrictId(id);
    setVillageId('');
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
      <select value={provinceId} disabled={provinces.status !== "ready"} onChange={(event) => chooseProvince(event.target.value)} required>
        <option value="">Pilih provinsi</option>
        {provinces.options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    {renderStatus('provinsi', provinces.status, provinces.retry)}
    <label>Kabupaten/Kota
      <select value={regencyId} onChange={(event) => chooseRegency(event.target.value)} disabled={!provinceId || regencies.status !== 'ready'} required>
        <option value="">Pilih kabupaten/kota</option>
        {regencies.options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    {renderStatus('kabupaten/kota', regencies.status, regencies.retry)}
    <label>Kecamatan
      <select value={districtId} onChange={(event) => chooseDistrict(event.target.value)} disabled={!regencyId || districts.status !== 'ready'} required>
        <option value="">Pilih kecamatan</option>
        {districts.options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    {renderStatus('kecamatan', districts.status, districts.retry)}
    <label>Desa/Kelurahan
      <select value={villageId} onChange={(event) => chooseVillage(event.target.value)} disabled={!districtId || villages.status !== 'ready'} required>
        <option value="">Pilih desa/kelurahan</option>
        {villages.options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    {renderStatus('desa/kelurahan', villages.status, villages.retry)}
    <small>Nama dan kode wilayah mengikuti referensi administrasi Kemendagri. Pilih berurutan dari atas.</small>
  </div>;
}
