import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
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
    expect(screen.getByRole('heading', { name: 'Temukan tempat singgah, temukan cerita.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Warkop pilihan' })).toBeTruthy();
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
    expect(screen.getByRole('heading', { name: 'Reels WarkopLink' })).toBeTruthy();
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
  it('scopes the warkop preview to the selected region before applying the preview limit', () => {
    render(<HomeDiscovery location={{ mode: 'region', label: 'Surabaya', query: 'surabaya' }} warungs={[
      { id: 'w1', name: 'Kopi Maduran', regencyName: 'Kabupaten Lamongan' },
      { id: 'w2', name: 'Kedai Surabaya', regencyName: 'Kota Surabaya' }
    ]} posts={[]} />);
    expect(screen.getByText('Kedai Surabaya')).toBeTruthy();
    expect(screen.queryByText('Kopi Maduran')).toBeNull();
  });

});

describe('Coffee Culture home visual system', () => {
  const styles = readFileSync('src/home/home-discovery.css', 'utf8');

  it('uses the official espresso-to-milk palette instead of the obsolete violet discovery palette', () => {
    expect(styles).toContain('--wl-espresso, #211A16');
    expect(styles).toContain('--wl-dark-roast, #493126');
    expect(styles).toContain('--wl-coffee, #98613B');
    expect(styles).toContain('--wl-caramel, #C58A52');
    expect(styles).toContain('--wl-cream, #F1E7D7');
    expect(styles).toContain('--wl-milk, #FAF7F1');
    expect(styles).toContain('home-view .home-explore-categories button');
  });

  it('places a real coffee photograph behind a translucent glass hero copy surface', () => {
    expect(styles).toContain('photo-1442512595331-e89e73853f31');
    expect(styles).toContain('backdrop-filter: blur(14px) saturate(125%)');
    expect(styles).toContain('rgba(33,26,22,.36)');
  });

  it('keeps the hero and discovery photography proportionate on mobile widths', () => {
    expect(styles).toContain('min-height: 470px');
    expect(styles).toContain('aspect-ratio: .94');
    expect(styles).toContain('@media (max-width: 380px)');
  });
});
