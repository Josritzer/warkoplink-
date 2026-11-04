import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CommunityDirectory, CommunityGroupHeader, CommunityShortcuts } from './CommunityHub.jsx';

afterEach(() => cleanup());

describe('seven official conversation categories', () => {
  it('shows seven shortcuts and opens the selected category', () => {
    const onSelectCommunity = vi.fn();
    render(<CommunityShortcuts onSelectCommunity={onSelectCommunity} onViewAll={vi.fn()}/>);
    expect(screen.getByRole('heading', { name: 'Kategori obrolan' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Buka kategori obrolan/ })).toHaveLength(7);
    fireEvent.click(screen.getByRole('button', { name: 'Buka kategori obrolan Ngopi Bareng' }));
    expect(onSelectCommunity).toHaveBeenCalledWith('ngopi-bareng');
  });

  it('shows all seven categories in the Obrolan directory', () => {
    const onSelectCommunity = vi.fn();
    render(<CommunityDirectory onSelectCommunity={onSelectCommunity}/>);
    expect(screen.getByRole('heading', { name: 'Pilih topik obrolan.' })).toBeTruthy();
    expect(screen.getByText('Tanya Warkop')).toBeTruthy();
    expect(screen.getByText('Komunitas & Aktivitas')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Buka kategori' })).toHaveLength(7);
    fireEvent.click(screen.getAllByRole('button', { name: 'Buka kategori' })[0]);
    expect(onSelectCommunity).toHaveBeenCalledWith('ngopi-bareng');
  });

  it('opens a category without join or leave membership controls', () => {
    render(<CommunityGroupHeader communityId="ngopi-bareng" onBack={vi.fn()}/>);
    expect(screen.getByRole('heading', { name: 'Ngopi Bareng' })).toBeTruthy();
    expect(screen.getByText('Pilih kategori dan langsung ikut berdiskusi.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Gabung komunitas|Keluar komunitas/i })).toBeNull();
  });
});
