import { useState } from 'react';
import { MessageCircle, Users, UserRound } from 'lucide-react';

const tabs = [
  { id: 'pribadi', label: 'Pribadi', icon: MessageCircle },
  { id: 'komunitas', label: 'Komunitas', icon: Users },
  { id: 'teman', label: 'Teman', icon: UserRound },
];

export default function MessagesPage({ onOpenPublicChat }) {
  const [activeTab, setActiveTab] = useState('pribadi');
  const active = tabs.find(tab => tab.id === activeTab) || tabs[0];
  const Icon = active.icon;

  return <section className="content-section messages-page" aria-label="Halaman Pesan">
    <span className="eyebrow">PESAN & KONEKSI</span>
    <h2>Pesan</h2>
    <p className="messages-intro">Tempat percakapan pribadi, komunitas resmi, dan teman akan berkumpul di sini.</p>
    <div className="messages-tabs" role="tablist" aria-label="Kategori pesan">
      {tabs.map(tab => <button
        key={tab.id}
        id={`messages-tab-${tab.id}`}
        type="button"
        role="tab"
        aria-selected={activeTab === tab.id}
        aria-controls="messages-tab-panel"
        className="messages-tab"
        onClick={() => setActiveTab(tab.id)}
      >{tab.label}</button>)}
    </div>
    <div id="messages-tab-panel" className="messages-panel" role="tabpanel" aria-labelledby={`messages-tab-${activeTab}`}>
      <div>
        <span className="messages-panel-icon"><Icon size={24}/></span>
        {activeTab === 'pribadi' ? <>
          <h3>Pesan pribadi belum aktif</h3>
          <p>Fitur pertemanan dan pesan pribadi belum aktif. Percakapan publik tetap bisa diikuti melalui Obrolan.</p>
          <button className="button button-dark" type="button" onClick={onOpenPublicChat}>Buka Obrolan Publik</button>
        </> : activeTab === 'komunitas' ? <>
          <h3>Komunitas resmi akan tampil di sini</h3>
          <p>Komunitas resmi dikelola oleh admin WarkopLink. Daftar dan ruang komunitas akan muncul setelah tersedia.</p>
        </> : <>
          <h3>Teman akan tampil di sini</h3>
          <p>Daftar teman menggunakan hubungan saling mengikuti. Fitur pertemanan belum diaktifkan, jadi belum ada daftar teman yang ditampilkan.</p>
        </>}
      </div>
    </div>
  </section>;
}
