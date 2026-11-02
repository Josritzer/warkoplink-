import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

afterEach(() => cleanup());
import ConversationHub, { ThematicGroupDirectory } from './ConversationHub.jsx';

describe('Obrolan directory', () => {
  it('opens on the seven thematic group rooms', () => {
    render(<ConversationHub onSelectCommunity={vi.fn()} onSelectThematicGroup={vi.fn()}/>);
    expect(screen.getByRole('tab', { name: 'Grup Tematik' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Pemilik Warkop')).toBeTruthy();
    expect(screen.getByText('Jaringan Warga')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Buka grup / })).toHaveLength(7);
  });

  it('opens the selected thematic group room', () => {
    const onSelectThematicGroup = vi.fn();
    render(<ConversationHub onSelectCommunity={vi.fn()} onSelectThematicGroup={onSelectThematicGroup}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Buka grup Pemilik Warkop' }));
    expect(onSelectThematicGroup).toHaveBeenCalledWith('pemilik-warkop');
  });

  it('filters thematic rooms by group name or topic', () => {
    render(<ThematicGroupDirectory onSelectGroup={vi.fn()}/>);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Cari grup tematik' }), { target: { value: 'lowongan' } });
    expect(screen.getByRole('button', { name: 'Buka grup Info Pekerjaan' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Buka grup Pemilik Warkop' })).toBeNull();
  });

  it('shows recent message preview and an unread marker for a member room', () => {
    render(<ThematicGroupDirectory groupActivity={{ 'pemilik-warkop': {
      joined: true,
      lastMessage: 'Ada pemasok kopi baru.',
      lastMessageAt: { toDate: () => new Date('2026-11-02T09:00:00Z') },
      unread: true
    }}}/>);
    expect(screen.getByText('Ada pemasok kopi baru.')).toBeTruthy();
    expect(screen.getByText('Belum dibaca')).toBeTruthy();
    expect(screen.getByText('Anggota')).toBeTruthy();
  });

  it('keeps the seven existing communities available in a separate tab', () => {
    render(<ConversationHub onSelectCommunity={vi.fn()} onSelectThematicGroup={vi.fn()}/>);
    fireEvent.click(screen.getByRole('tab', { name: 'Komunitas' }));
    expect(screen.getByRole('tab', { name: 'Komunitas' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Temukan komunitasmu.' })).toBeTruthy();
    expect(screen.getByText('Ngopi Bareng')).toBeTruthy();
  });
});
