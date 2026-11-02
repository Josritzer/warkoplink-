export const THEMATIC_GROUPS = [
  {
    id: 'pemilik-warkop',
    name: 'Pemilik Warkop',
    description: 'Berbagi pengalaman mengelola warkop, operasional, pelanggan, dan pemasok.',
    icon: 'store'
  },
  {
    id: 'pelaku-umkm',
    name: 'Pelaku UMKM',
    description: 'Berkolaborasi, berbagi peluang, dan mengembangkan usaha lokal.',
    icon: 'briefcase-business'
  },
  {
    id: 'info-pekerjaan',
    name: 'Info Pekerjaan',
    description: 'Berbagi lowongan kerja dan kesempatan kerja yang relevan.',
    icon: 'briefcase'
  },
  {
    id: 'event-nobar',
    name: 'Event & Nobar',
    description: 'Mengatur acara, nonton bareng, dan kegiatan bersama.',
    icon: 'calendar-days'
  },
  {
    id: 'komunitas-olahraga',
    name: 'Komunitas Olahraga',
    description: 'Mencari teman olahraga dan mengatur aktivitas bersama.',
    icon: 'volleyball'
  },
  {
    id: 'kreator-lokal',
    name: 'Kreator Lokal',
    description: 'Berkolaborasi membuat konten, foto, video, dan promosi kreatif.',
    icon: 'camera'
  },
  {
    id: 'jaringan-warga',
    name: 'Jaringan Warga',
    description: 'Berbagi informasi lingkungan, bantuan warga, dan koneksi lokal.',
    icon: 'users'
  }
];

const THEMATIC_GROUP_IDS = new Set(THEMATIC_GROUPS.map((group) => group.id));

export function isThematicGroupId(value) {
  return typeof value === 'string' && THEMATIC_GROUP_IDS.has(value);
}

export function getThematicGroupById(value) {
  return THEMATIC_GROUPS.find((group) => group.id === value) || null;
}
