import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import OfficialRegionPicker, { clearOfficialRegionCache } from './OfficialRegionPicker.jsx';

const responses = {
  'provinces.json': [{ id: '35', name: 'Jawa Timur' }],
  'regencies/35.json': [{ id: '35.24', name: 'Kabupaten Lamongan' }],
  'districts/35.24.json': [{ id: '35.24.10', name: 'Maduran' }],
  'villages/35.24.10.json': [{ id: '35.24.10.2007', name: 'Maduran' }],
};

afterEach(() => {
  cleanup();
  clearOfficialRegionCache();
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

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Provinsi' }).options.length).toBe(2));
    fireEvent.change(screen.getByRole('combobox', { name: 'Provinsi' }), { target: { value: '35' } });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Kabupaten/Kota' }).options.length).toBe(2));
    fireEvent.change(screen.getByRole('combobox', { name: 'Kabupaten/Kota' }), { target: { value: '35.24' } });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Kecamatan' }).options.length).toBe(2));
    fireEvent.change(screen.getByRole('combobox', { name: 'Kecamatan' }), { target: { value: '35.24.10' } });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Desa/Kelurahan' }).options.length).toBe(2));
    fireEvent.change(screen.getByRole('combobox', { name: 'Desa/Kelurahan' }), { target: { value: '35.24.10.2007' } });

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
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Provinsi' }).options.length).toBe(2));
    fireEvent.change(screen.getByRole('combobox', { name: 'Provinsi' }), { target: { value: '35' } });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Kabupaten/Kota' }).options.length).toBe(2));
    fireEvent.change(screen.getByRole('combobox', { name: 'Kabupaten/Kota' }), { target: { value: '35.24' } });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Kecamatan' }).options.length).toBe(2));
    fireEvent.change(screen.getByRole('combobox', { name: 'Provinsi' }), { target: { value: '' } });
    expect(screen.getByRole('combobox', { name: 'Kabupaten/Kota' }).value).toBe('');
    expect(screen.getByRole('combobox', { name: 'Kecamatan' }).value).toBe('');
    expect(screen.getByRole('combobox', { name: 'Desa/Kelurahan' }).value).toBe('');
  });

  it('menyaring daftar wilayah berdasarkan kata kunci tanpa mengubah kode pilihan', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const key = String(url).split('/v2/')[1];
      return { ok: true, json: async () => ({ data: key === 'provinces.json' ? [
        { id: '31', name: 'DKI Jakarta' }, { id: '35', name: 'Jawa Timur' }
      ] : [] }) };
    }));
    render(<OfficialRegionPicker onChange={vi.fn()}/>);
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Provinsi' }).options.length).toBe(3));
    fireEvent.change(screen.getByLabelText('Cari provinsi'), { target: { value: 'jawa' } });
    expect(screen.getByRole('combobox', { name: 'Provinsi' }).options.length).toBe(2);
    expect(screen.getByRole('combobox', { name: 'Provinsi' }).options[1].textContent).toBe('Jawa Timur');
  });

  it('menampilkan pesan saat sumber data wilayah tidak tersedia', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    render(<OfficialRegionPicker onChange={vi.fn()} />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/Data provinsi gagal dimuat/);
  });
});
