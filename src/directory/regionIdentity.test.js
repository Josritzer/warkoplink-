import { describe, expect, it } from 'vitest';
import { buildRegionIdentity } from './regionIdentity.js';

describe('identitas wilayah nasional', () => {
  it('membuat ID wilayah internal yang konsisten dari provinsi dan kabupaten/kota', () => {
    expect(buildRegionIdentity('Jawa Timur', 'Kota Surabaya')).toEqual({
      regionCode: 'id-jawa-timur-kota-surabaya',
      provinceName: 'Jawa Timur',
      regencyName: 'Kota Surabaya',
    });
  });

  it('menormalkan huruf, spasi, dan aksen tanpa mengubah nama tampilan', () => {
    expect(buildRegionIdentity('Daerah Istimewa Yogyakarta', 'Kabupaten Kulon Progo').regionCode)
      .toBe('id-daerah-istimewa-yogyakarta-kabupaten-kulon-progo');
  });

  it('menolak nama wilayah kosong atau terlalu panjang', () => {
    expect(() => buildRegionIdentity('', 'Kabupaten Lamongan')).toThrow();
    expect(() => buildRegionIdentity('Jawa Timur', 'x'.repeat(81))).toThrow();
  });
});
