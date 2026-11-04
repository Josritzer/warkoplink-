import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { fireEvent, render, screen } from '@testing-library/react';
import HomeDiscovery from './HomeDiscovery.jsx';

afterEach(cleanup);

describe('HomeDiscovery', () => {
  it('renders real verified warungs and opens their existing profile route', () => {
    const onOpenWarung = vi.fn();
    render(<HomeDiscovery
      warungs={[{ id: 'w1', name: 'Kopi Maduran', verificationStatus: 'verified', address: 'Maduran, Lamongan', photos: ['https://images.example.test/kopi.jpg'], specialties: ['Kopi tubruk'] }]}
      posts={[]}
      onOpenWarung={onOpenWarung}
    />);
    expect(screen.getByRole('heading', { name: 'Warkop untuk disinggahi' })).toBeTruthy();
    expect(screen.getByText('Kopi Maduran')).toBeTruthy();
    expect(screen.getByText('Kopi tubruk')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lihat profil' }));
    expect(onOpenWarung).toHaveBeenCalledWith('w1');
  });

  it('shows only published video URLs and real upcoming events', () => {
    render(<HomeDiscovery posts={[
      { id: 'video-1', videoURL: 'https://cdn.example.test/reel.mp4', videoThumbnailURL: 'https://cdn.example.test/reel.jpg', body: 'Suasana sore' },
      { id: 'no-video', videoThumbnailURL: 'https://cdn.example.test/no-video.jpg', body: 'Hanya poster' },
      { id: 'event-1', topic: 'Info & Acara', eventStartAt: '2099-11-06T19:00:00+07:00', eventKind: 'Nobar', body: 'Nobar final' }
    ]} />);
    expect(screen.getByText('WARKOPLINK Reels')).toBeTruthy();
    expect(screen.getByLabelText('Video komunitas WarkopLink').getAttribute('src')).toBe('https://cdn.example.test/reel.mp4');
    expect(screen.getByText('Nobar final')).toBeTruthy();
    expect(document.querySelectorAll('.home-reel-card video')).toHaveLength(1);
  });

  it('renders truthful empty states when no discovery records exist', () => {
    render(<HomeDiscovery warungs={[]} posts={[]} />);
    expect(screen.getByText('Belum ada warkop untuk ditampilkan')).toBeTruthy();
    expect(screen.getByText('Belum ada video untuk ditampilkan')).toBeTruthy();
    expect(screen.getByText('Belum ada agenda mendatang')).toBeTruthy();
  });

  it('filters visible warungs using the discovery search field', () => {
    render(<HomeDiscovery warungs={[
      { id: 'w1', name: 'Kopi Maduran', verificationStatus: 'verified' },
      { id: 'w2', name: 'Kedai Kota', verificationStatus: 'verified' }
    ]} posts={[]} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Cari warkop, menu, atau kegiatan' }), { target: { value: 'maduran' } });
    expect(screen.getByText('Kopi Maduran')).toBeTruthy();
    expect(screen.queryByText('Kedai Kota')).toBeNull();
  });
});
