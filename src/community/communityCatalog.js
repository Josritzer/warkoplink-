export const COMMUNITY_GROUPS = [
  {
    id: 'ngopi-bareng',
    name: 'Ngopi Bareng',
    description: 'Temukan teman ngopi, berbagi cerita, dan mengatur pertemuan.',
    icon: 'coffee'
  },
  {
    id: 'tanya-warkop',
    name: 'Tanya Warkop',
    description: 'Tanya rekomendasi tempat, menu, fasilitas, dan pengalaman berkunjung.',
    icon: 'question'
  },
  {
    id: 'info-acara',
    name: 'Info & Acara',
    description: 'Bagikan informasi, agenda, nobar, dan kegiatan yang akan datang.',
    icon: 'calendar'
  },
  {
    id: 'loker',
    name: 'Loker',
    description: 'Temukan dan bagikan informasi lowongan kerja.',
    icon: 'briefcase'
  },
  {
    id: 'jual-beli',
    name: 'Jual Beli',
    description: 'Tempat berbagi penawaran barang dan kebutuhan jual beli.',
    icon: 'shopping'
  },
  {
    id: 'jasa-lokal',
    name: 'Jasa Lokal',
    description: 'Temukan dan promosikan jasa serta keahlian lokal.',
    icon: 'wrench'
  },
  {
    id: 'komunitas-aktivitas',
    name: 'Komunitas & Aktivitas',
    description: 'Berkumpul berdasarkan hobi, minat, dan aktivitas bersama.',
    icon: 'users'
  }
];

const COMMUNITY_IDS = new Set(COMMUNITY_GROUPS.map((community) => community.id));

export function isCommunityId(value) {
  return typeof value === 'string' && COMMUNITY_IDS.has(value);
}

export function getCommunityById(value) {
  return COMMUNITY_GROUPS.find((community) => community.id === value) || null;
}
