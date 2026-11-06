import { describe, expect, it } from 'vitest';
import { buildHomeDiscoveryData, getHomeActivityStatus } from './homeDiscoveryModel.js';

const now = new Date('2026-11-05T05:00:00+07:00');

describe('home discovery model', () => {
  it('keeps verified warungs and caps the home preview without inventing rank', () => {
    const warungs = Array.from({ length: 10 }, (_, index) => ({ id: String(index), name: `Warkop ${index}`, verificationStatus: 'verified' }));
    const result = buildHomeDiscoveryData(warungs, [], now);
    expect(result.warungs).toHaveLength(10);
    expect(result.warungs[0].id).toBe('0');
    expect(result.warungs.every(item => item.verificationStatus === 'verified')).toBe(true);
  });

  it('shows activity posts only when their category is an activity category', () => {
    const posts = [
      { id: 'coffee', topic: 'Ngopi Bareng', postType: 'Ajakan ngopi', body: 'Ngopi sore' },
      { id: 'community', topic: 'Komunitas & Aktivitas', postType: 'Kegiatan warga', body: 'Kumpul komunitas' },
      { id: 'question', topic: 'Tanya Warkop', body: 'Tanya lokasi' },
      { id: 'invalid-event', topic: 'Info & Acara', body: 'Acara tanpa waktu' }
    ];
    expect(buildHomeDiscoveryData([], posts, now).activities.map(post => post.id)).toEqual(['coffee', 'community']);
  });

  it('classifies events from valid start/end times and cancellation status', () => {
    expect(getHomeActivityStatus({ eventStartAt: '2026-11-05T04:00:00+07:00', eventEndAt: '2026-11-05T06:00:00+07:00' }, now)).toBe('ongoing');
    expect(getHomeActivityStatus({ eventStartAt: '2026-11-05T07:00:00+07:00' }, now)).toBe('scheduled');
    expect(getHomeActivityStatus({ eventStartAt: '2026-11-05T03:00:00+07:00', eventEndAt: '2026-11-05T04:00:00+07:00' }, now)).toBe('completed');
    expect(getHomeActivityStatus({ eventStartAt: '2026-11-05T07:00:00+07:00', eventStatus: 'cancelled' }, now)).toBe('cancelled');
    expect(getHomeActivityStatus({ eventStartAt: 'not-a-date' }, now)).toBe('unknown');
  });

  it('includes only records with a real video URL and upcoming, non-cancelled events', () => {
    const posts = [
      { id: 'video', videoURL: 'https://cdn.example.test/reel.mp4', videoThumbnailURL: 'https://cdn.example.test/reel.jpg' },
      { id: 'no-video', videoThumbnailURL: 'https://cdn.example.test/no-video.jpg' },
      { id: 'future', topic: 'Info & Acara', eventStartAt: '2026-11-06T19:00:00+07:00', eventStatus: 'scheduled' },
      { id: 'live', topic: 'Info & Acara', eventStartAt: '2026-11-05T04:00:00+07:00', eventEndAt: '2026-11-05T06:00:00+07:00' },
      { id: 'cancelled', topic: 'Info & Acara', eventStartAt: '2026-11-06T20:00:00+07:00', eventStatus: 'cancelled' },
      { id: 'past', topic: 'Info & Acara', eventStartAt: '2026-11-04T20:00:00+07:00' }
    ];
    const result = buildHomeDiscoveryData([], posts, now);
    expect(result.reels.map(post => post.id)).toEqual(['video']);
    expect(result.events.map(post => post.id)).toEqual(['future']);
    expect(result.activities.map(post => post.id)).toEqual(['live']);
  });
});
