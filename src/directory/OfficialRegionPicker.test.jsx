import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import OfficialRegionPicker from './OfficialRegionPicker.jsx';

const responses = {
  'provinces.json': [{ id: '35', name: 'Jawa Timur' }],
  'regencies/35.json': [{ id: '35.24', name: 'Kabupaten Lamongan' }],
  'districts/35.24.json': [{ id: '35.24.10', name: 'Maduran' }],
  'villages/35.24.10.json': [{ id: '35.24.10.2007', name: 'Maduran' }],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('OfficialRegionPicker', () => {
  it('memilih empat tingkat wilayah dari data berkode resmi dan mengirim identitas baku', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const key = String(url).split('/v2/')[1];
      return { ok: true, json: async () => ({ data: responses[key] || [] }) };
    }));
    const onChange = vi.fn();
    render(<OfficialRegionPicker onChange={onChange} />);

    await waitFor(() => expect(screen.getByLabelText('Provinsi').options.length).toBe(2));
    fireEvent.change(screen.getByLabelText('Provinsi'), { target: { value: '35' } });
    await waitFor(() => expect(screen.getByLabelText('Kabupaten/Kota').options.length).toBe(2));
    fireEvent.change(screen.getByLabelText('Kabupaten/Kota'), { target: { value: '35.24' } });
    await waitFor(() => expect(screen.getByLabelText('Kecamatan').options.length).toBe(2));
    fireEvent.change(screen.getByLabelText('Kecamatan'), { target: { value: '35.24.10' } });
    await waitFor(() => expect(screen.getByLabelText('Desa/Kelurahan').options.length).toBe(2));
    fireEvent.change(screen.getByLabelText('Desa/Kelurahan'), { target: { value: '35.24.10.2007' } });

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({
      provinceCode: '35', provinceName: 'Jawa Timur',
      regencyCode: '35.24', regencyName: 'Kabupaten Lamongan',
      districtCode: '35.24.10', districtName: 'Maduran',
      villageCode: '35.24.10.2007', villageName: 'Maduran',
    }));
  });

  it('mengosongkan pilihan turunan saat induk diganti', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const key = String(url).split('/v2/')[1];
      return { ok: true, json: async () => ({ data: responses[key] || [] }) };
    }));
    const onChange = vi.fn();
    render(<OfficialRegionPicker onChange={onChange} />);
    await waitFor(() => expect(screen.getByLabelText('Provinsi').options.length).toBe(2));
    fireEvent.change(screen.getByLabelText('Provinsi'), { target: { value: '35' } });
    await waitFor(() => expect(screen.getByLabelText('Kabupaten/Kota').options.length).toBe(2));
    fireEvent.change(screen.getByLabelText('Kabupaten/Kota'), { target: { value: '35.24' } });
    await waitFor(() => expect(screen.getByLabelText('Kecamatan').options.length).toBe(2));
    fireEvent.change(screen.getByLabelText('Provinsi'), { target: { value: '' } });
    expect(screen.getByLabelText('Kabupaten/Kota').value).toBe('');
    expect(screen.getByLabelText('Kecamatan').value).toBe('');
    expect(screen.getByLabelText('Desa/Kelurahan').value).toBe('');
  });

  it('menampilkan pesan saat sumber data wilayah tidak tersedia', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    render(<OfficialRegionPicker onChange={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Data provinsi gagal dimuat/);
  });
});
