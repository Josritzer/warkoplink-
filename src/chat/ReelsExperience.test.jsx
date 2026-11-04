import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ReelsExperience from './ReelsExperience.jsx';

const videos = [
  { id: 'clip-1', authorId: 'user-1', authorName: 'Raka', body: 'Nobar malam ini, kursi masih ada.', topic: 'Info & Acara', location: 'Bandung', videoURL: 'https://media.example/one.mp4', totalReactions: 12, commentCount: 3 },
  { id: 'clip-2', authorId: 'user-2', authorName: 'Sari', body: 'Kopi tubruk sore ini.', videoURL: 'https://media.example/two.mp4' }
];

const baseProps = {
  posts: videos,
  status: 'ready',
  onLike: vi.fn(),
  onComments: vi.fn(),
  onShare: vi.fn(),
  onOpenProfile: vi.fn(),
  onOpenWarung: vi.fn(),
  onNavigate: vi.fn()
};

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WARKOPLINK Reels experience', () => {
  it('plays only the active video inline and starts muted', () => {
    render(<ReelsExperience {...baseProps}/>);
    const video = screen.getByLabelText('Video dari Raka');
    expect(video.getAttribute('src')).toBe(videos[0].videoURL);
    expect(video.playsInline).toBe(true);
    expect(video.muted).toBe(true);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it('moves to the next video and updates the active creator', () => {
    render(<ReelsExperience {...baseProps}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Video berikutnya' }));
    expect(screen.getByLabelText('Video dari Sari').getAttribute('src')).toBe(videos[1].videoURL);
    expect(screen.getByText('Sari')).toBeTruthy();
    expect(screen.getByLabelText('Video sebelumnya').disabled).toBe(false);
  });

  it('moves down the feed with an upward vertical swipe', () => {
    render(<ReelsExperience {...baseProps}/>);
    const stage = screen.getByRole('region', { name: 'WARKOPLINK Reels' }).firstChild;
    fireEvent.touchStart(stage, { touches: [{ identifier: 1, clientX: 180, clientY: 650 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ identifier: 1, clientX: 180, clientY: 525 }] });
    expect(screen.getByLabelText('Video dari Sari').getAttribute('src')).toBe(videos[1].videoURL);
  });

  it('routes like, comment, share and creator actions to existing handlers', () => {
    render(<ReelsExperience {...baseProps}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Sukai video' }));
    fireEvent.click(screen.getByRole('button', { name: 'Buka komentar, 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bagikan video' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lihat profil Raka' }));
    expect(baseProps.onLike).toHaveBeenCalledWith(videos[0]);
    expect(baseProps.onComments).toHaveBeenCalledWith(videos[0]);
    expect(baseProps.onShare).toHaveBeenCalledWith(videos[0]);
    expect(baseProps.onOpenProfile).toHaveBeenCalledWith({ uid: 'user-1', displayName: 'Raka', photoURL: undefined });
  });

  it('links a video to its existing verified warung relation', () => {
    const post = { ...videos[0], warungId: 'warung-1' };
    render(<ReelsExperience {...baseProps} posts={[post]} verifiedWarungs={[{ id: 'warung-1', name: 'Kopi Sudut' }]}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Lihat profil warkop Kopi Sudut' }));
    expect(baseProps.onOpenWarung).toHaveBeenCalledWith('warung-1');
  });

  it('shows recoverable loading error and retry action when there are no loaded videos', () => {
    const onRetry = vi.fn();
    render(<ReelsExperience posts={[]} status="error" onRetry={onRetry}/>);
    expect(screen.getByRole('alert').textContent).toContain('Belum bisa memuat Reels');
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('offers a locally meaningful empty state when the feed has no videos', () => {
    render(<ReelsExperience posts={[]} status="ready" onCreateVideo={baseProps.onNavigate}/>);
    expect(screen.getByRole('heading', { name: 'Belum ada video di sekitar' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bagikan video pertama' }));
    expect(baseProps.onNavigate).toHaveBeenCalledOnce();
  });
});
