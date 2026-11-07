import { describe, expect, it } from 'vitest';
import { groupActivityOptions } from './discoveryClassification.js';

describe('groupActivityOptions', () => {
  it('mengelompokkan aktivitas berdasarkan tujuan, bukan urutan alfabetis', () => {
    expect(groupActivityOptions([
      { key: 'nobar', label: 'Nobar' },
      { key: 'kerja-laptop', label: 'Bekerja dengan laptop' },
      { key: 'komunitas', label: 'Komunitas' },
      { key: 'ngopi-bareng', label: 'Ngopi bareng' },
      { key: 'gim', label: 'Gim' },
      { key: 'olahraga', label: 'Olahraga' },
    ])).toEqual([
      { key: 'work', label: 'Kerja & produktivitas', options: [{ key: 'kerja-laptop', label: 'Bekerja dengan laptop' }] },
      { key: 'social', label: 'Ngopi & komunitas', options: [{ key: 'ngopi-bareng', label: 'Ngopi bareng' }, { key: 'komunitas', label: 'Komunitas' }] },
      { key: 'entertainment', label: 'Hiburan & kegiatan', options: [{ key: 'nobar', label: 'Nobar' }, { key: 'gim', label: 'Gim' }, { key: 'olahraga', label: 'Olahraga' }] },
    ]);
  });

  it('menempatkan aktivitas baru yang belum dipetakan pada kelompok lainnya', () => {
    expect(groupActivityOptions([{ key: 'workshop', label: 'Workshop' }])).toEqual([
      { key: 'other', label: 'Aktivitas lainnya', options: [{ key: 'workshop', label: 'Workshop' }] },
    ]);
  });
});
