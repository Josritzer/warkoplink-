import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

afterEach(() => cleanup());
import ConversationHub from './ConversationHub.jsx';

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

  it('keeps the seven existing communities available in a separate tab', () => {
    render(<ConversationHub onSelectCommunity={vi.fn()} onSelectThematicGroup={vi.fn()}/>);
    fireEvent.click(screen.getByRole('tab', { name: 'Komunitas' }));
    expect(screen.getByRole('tab', { name: 'Komunitas' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Temukan komunitasmu.' })).toBeTruthy();
    expect(screen.getByText('Ngopi Bareng')).toBeTruthy();
  });
});
