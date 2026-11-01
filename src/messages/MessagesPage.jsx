import { useState } from 'react';
import { MessageCircle, Users, UserRound } from 'lucide-react';

const MESSAGE_TABS = [
  {
    id: 'private',
    label: 'Pribadi',
    title: 'Pesan pribadi belum tersedia',
    description: 'Percakapan pribadi akan diaktifkan setelah sistem mutual follow dan pemeriksaan akses dua peserta selesai dibangun.',
    Icon: MessageCircle,
  },
  {
    id: 'communities',
    label: 'Komunitas',
    title: 'Komunitas resmi sedang disiapkan',
    description: 'Ruang diskusi komunitas WarkopLink akan tampil di sini setelah sistem komunitas resmi dan keanggotaannya tersedia.',
    Icon: Users,
  },
  {
    id: 'friends',
    label: 'Teman',
    title: 'Daftar teman akan tersedia setelah mutual follow dibangun',
    description: 'Teman ditentukan dari dua pengguna yang saling mengikuti. Daftar ini belum ditampilkan sebelum data follow pengguna tersedia.',
    Icon: UserRound,
  },
];

export default function MessagesPage() {
  const [activeTab, setActiveTab] = useState('private');
  const active = MESSAGE_TABS.find((tab) => tab.id === activeTab) || MESSAGE_TABS[0];
  const ActiveIcon = active.Icon;

  return (
    <section className="content-section messages-page" aria-labelledby="messages-title">
      <span className="eyebrow">RUANG TERHUBUNG</span>
      <div className="messages-page-heading">
        <h2 id="messages-title">Pesan</h2>
        <p>Satu tempat untuk percakapan pribadi, komunitas resmi, dan pertemanan.</p>
      </div>
      <div className="messages-tabs" role="tablist" aria-label="Kategori pesan">
        {MESSAGE_TABS.map((tab) => (
          <button
            key={tab.id}
            id={`messages-tab-${tab.id}`}
            type="button"
            role="tab"
            className="messages-tab"
            aria-selected={activeTab === tab.id}
            aria-controls="messages-panel"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <section
        id="messages-panel"
        className="messages-panel"
        role="tabpanel"
        aria-labelledby={`messages-tab-${active.id}`}
        tabIndex={0}
      >
        <span className="messages-empty-icon" aria-hidden="true"><ActiveIcon/></span>
        <h3>{active.title}</h3>
        <p>{active.description}</p>
      </section>
    </section>
  );
}
