export const COMMUNITY_GROUPS = [
  {
    id: 'kopi-kuliner',
    name: 'Kopi & Kuliner',
    description: 'Ngobrol soal kopi, makanan, menu andalan, dan tempat nongkrong.',
    icon: 'coffee'
  },
  {
    id: 'sepak-bola-olahraga',
    name: 'Sepak Bola & Olahraga',
    description: 'Sepak bola, futsal, badminton, olahraga, dan kabar pertandingan.',
    icon: 'trophy'
  },
  {
    id: 'bisnis-umkm',
    name: 'Bisnis & UMKM',
    description: 'Usaha lokal, promosi produk, peluang, dan pengalaman berbisnis.',
    icon: 'store'
  },
  {
    id: 'musik-hiburan',
    name: 'Musik & Hiburan',
    description: 'Musik, film, hiburan, kreativitas, dan game ringan.',
    icon: 'music'
  },
  {
    id: 'hobi-komunitas',
    name: 'Hobi & Komunitas',
    description: 'Temukan teman dengan hobi dan minat yang sama.',
    icon: 'bike'
  },
  {
    id: 'warga-kegiatan-lokal',
    name: 'Warga & Kegiatan Lokal',
    description: 'Informasi warga, kegiatan desa, acara, dan aktivitas sosial.',
    icon: 'users'
  },
  {
    id: 'obrolan-santai',
    name: 'Obrolan Santai',
    description: 'Cerita sehari-hari, pengalaman, dan percakapan bebas.',
    icon: 'messages'
  }
];

const COMMUNITY_IDS = new Set(COMMUNITY_GROUPS.map((community) => community.id));

export function isCommunityId(value) {
  return typeof value === 'string' && COMMUNITY_IDS.has(value);
}

export function getCommunityById(value) {
  return COMMUNITY_GROUPS.find((community) => community.id === value) || null;
}
