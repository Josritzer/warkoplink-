import { describe, expect, it } from 'vitest';
import { buildRegionIdentity } from './regionIdentity.js';

const maduran = {
  provinceCode: '35', provinceName: ' Jawa   Timur ',
  regencyCode: '35.24', regencyName: 'Kabupaten Lamongan',
  districtCode: '35.24.10', districtName: 'Maduran',
  villageCode: '35.24.10.2007', villageName: 'Maduran',
};

describe('identitas wilayah administrasi resmi', () => {
  it('menyimpan kode resmi dan nama baku empat tingkat wilayah', () => {
    expect(buildRegionIdentity(maduran)).toEqual({
      regionCode: '35.24.10.2007',
      provinceCode: '35', provinceName: 'Jawa Timur',
      regencyCode: '35.24', regencyName: 'Kabupaten Lamongan',
      districtCode: '35.24.10', districtName: 'Maduran',
      villageCode: '35.24.10.2007', villageName: 'Maduran',
    });
  });

  it('menolak kode anak yang tidak berada di bawah kode induknya', () => {
    expect(() => buildRegionIdentity({ ...maduran, districtCode: '35.24.11' })).toThrow(/Kode wilayah/);
    expect(() => buildRegionIdentity({ ...maduran, villageCode: '35.24.11.2007' })).toThrow(/Kode wilayah/);
  });

  it('menolak pilihan wilayah yang tidak lengkap atau nama kosong', () => {
    expect(() => buildRegionIdentity(null)).toThrow();
    expect(() => buildRegionIdentity({ ...maduran, villageCode: '' })).toThrow();
    expect(() => buildRegionIdentity({ ...maduran, villageName: ' ' })).toThrow();
  });
});
