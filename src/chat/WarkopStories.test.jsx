import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WarkopStories from './WarkopStories.jsx';

describe('WarkopStories', () => {
  it('menampilkan ajakan menulis cerita saat belum ada obrolan', () => {
    const onStart = vi.fn();
    render(<WarkopStories posts={[]} status="ready" onStart={onStart} />);
    fireEvent.click(screen.getByText('Pagi di warkop').closest('button'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
  it('menampilkan obrolan yang sudah dimuat sebagai kartu cerita', () => {
    const onOpen = vi.fn();
    const post = { id: 'p1', body: 'Kopi tubruknya mantap pagi ini', authorName: 'Rina', topic: 'Ngopi Bareng' };
    render(<WarkopStories posts={[post]} status="ready" onOpen={onOpen} />);
    fireEvent.click(screen.getByText(/Kopi tubruknya mantap/).closest('button'));
    expect(onOpen).toHaveBeenCalledWith(post);
    expect(screen.getByText('Rina')).toBeTruthy();
  });
});
