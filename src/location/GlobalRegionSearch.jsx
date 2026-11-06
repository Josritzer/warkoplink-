import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, MapPin, RotateCcw } from 'lucide-react';
import { fetchOfficialRegionOptions } from '../directory/OfficialRegionPicker.jsx';

const STEPS = [
  { key: 'province', label: 'Provinsi', search: 'Cari provinsi…', path: 'provinces', code: 'provinceCode', name: 'provinceName' },
  { key: 'regency', label: 'Kabupaten/Kota', search: 'Cari kabupaten/kota…', code: 'regencyCode', name: 'regencyName' },
  { key: 'district', label: 'Kecamatan', search: 'Cari kecamatan…', code: 'districtCode', name: 'districtName' },
  { key: 'village', label: 'Desa/Kelurahan', search: 'Cari desa/kelurahan…', code: 'villageCode', name: 'villageName' },
];

function nextStepIndex(selection) {
  const index = STEPS.findIndex((step) => !selection?.[step.code] || !selection?.[step.name]);
  return index === -1 ? STEPS.length : index;
}

export default function GlobalRegionSearch({ value = null, onChange }) {
  const [selection, setSelection] = useState(value || {});
  const [stepIndex, setStepIndex] = useState(nextStepIndex(value));
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState([]);
  const [status, setStatus] = useState('idle');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setSelection(value || {});
    setStepIndex(nextStepIndex(value));
    setQuery('');
  }, [value]);

  const step = STEPS[stepIndex] || null;
  const parentPath = stepIndex === 0 ? '' : selection[STEPS[stepIndex - 1].code];
  const path = !step ? '' : stepIndex === 0 ? step.path : `${step.key === 'regency' ? 'regencies' : step.key === 'district' ? 'districts' : 'villages'}/${parentPath}`;

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

  const filteredOptions = useMemo(() => {
    const normalize = (text) => text
      .normalize('NFD')
      .replace(/[\\u0300-\\u036f]/g, '')
      .toLocaleLowerCase('id-ID')
      .trim();
    const needle = normalize(query);
    if (!needle) return [];
    return options.filter((item) => normalize(item.name).startsWith(needle));
  }, [options, query]);

  function choose(item) {
    const next = { ...selection, [step.code]: item.id, [step.name]: item.name };
    for (const later of STEPS.slice(stepIndex + 1)) {
      delete next[later.code];
      delete next[later.name];
    }
    setSelection(next);
    setQuery('');
    if (stepIndex === STEPS.length - 1) {
      onChange?.(next);
      setStepIndex(STEPS.length);
      return;
    }
    setStepIndex(stepIndex + 1);
  }

  function goBack() {
    if (stepIndex > 0 && stepIndex < STEPS.length) {
      const previous = stepIndex - 1;
      const next = { ...selection };
      for (const later of STEPS.slice(stepIndex)) {
        delete next[later.code];
        delete next[later.name];
      }
      setSelection(next);
      setStepIndex(previous);
      setQuery('');
    } else if (stepIndex === STEPS.length) {
      setStepIndex(STEPS.length - 1);
      setQuery('');
    }
  }

  function restart() {
    setSelection({});
    setStepIndex(0);
    setQuery('');
    onChange?.(null);
  }

  const completed = stepIndex === STEPS.length && STEPS.every((item) => selection[item.code] && selection[item.name]);
  const breadcrumb = STEPS.filter((item) => selection[item.name]).map((item) => selection[item.name]);

  return <div className="global-region-search">
    {completed ? <>
      <div className="global-region-result" aria-live="polite">
        <MapPin size={16}/>
        <span>{breadcrumb.slice().reverse().join(', ')}</span>
        <Check size={16}/>
      </div>
      <button className="global-region-change" type="button" onClick={restart}><RotateCcw size={13}/> Ganti wilayah</button>
    </> : <>
      <div className="global-region-progress" aria-label={`Tahap ${stepIndex + 1} dari 4`}>
        {STEPS.map((item, index) => <span key={item.key} className={index < stepIndex ? 'done' : index === stepIndex ? 'current' : ''}>{index + 1}</span>)}
        <small>{step?.label}</small>
      </div>
      {stepIndex > 0 && <button className="global-region-back" type="button" onClick={goBack}><ArrowLeft size={13}/> Kembali</button>}
      <label className="global-region-searchbox">
        <MapPin size={16}/>
        <input
          type="search"
          aria-label={step?.search.replace('…', '')}
          placeholder={step?.search || 'Cari wilayah…'}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
        />
      </label>
      <div className="global-region-trail" aria-live="polite">
        {breadcrumb.length ? breadcrumb.join(' › ') : 'Pilih wilayah secara bertahap'}
      </div>
      <div className="global-region-options" role="listbox" aria-label={`Daftar ${step?.label || 'wilayah'}`}>
        {status === 'loading' && <p role="status">Memuat {step?.label.toLowerCase()}…</p>}
        {status === 'error' && <p role="alert">Data gagal dimuat. <button type="button" onClick={() => setRetry((count) => count + 1)}>Coba lagi</button></p>}
        {status === 'ready' && !query.trim() && <p>Ketik nama {step?.label.toLowerCase()} untuk melihat rekomendasi.</p>}
        {status === 'ready' && query.trim() && filteredOptions.length === 0 && <p>Tidak ada lokasi yang diawali “{query.trim()}”.</p>}
        {status === 'ready' && filteredOptions.slice(0, 80).map((item) => <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={selection[step?.code] === item.id}
          onClick={() => choose(item)}
        ><span>{item.name}</span><ChevronRight size={15}/></button>)}
      </div>
    </>}
  </div>;
}
